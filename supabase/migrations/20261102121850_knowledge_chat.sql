-- Knowledge + chat: the private Storage bucket and the four functions both lanes need.
--
--   reserve_knowledge_source  claim a knowledge source slot under the plan's limit
--   consume_message           count one chat message against the monthly quota
--   save_chat_turn            store a visitor message and the bot's reply
--   match_chunks              the closest chunks of one project's ready sources
--
-- Same pattern as create_project: SECURITY INVOKER, empty search_path, fully
-- qualified names, EXECUTE revoked from public/anon/authenticated and granted to
-- service_role only. The limits are passed in by the route (from PLAN_LIMITS).
--
-- Errors the routes can recognise (PostgREST returns the SQLSTATE as `code`):
--   AW003  source_limit_reached    the project already has p_max_sources sources
--   AW004  project_not_found       no project with p_project_id
--   AW005  conversation_not_found  no conversation with that id in this project
--   22023  a required limit or count was null or out of range

-- Storage bucket ------------------------------------------------------------
-- Private; 10 MB (MAX_KNOWLEDGE_FILE_BYTES); PDF, Markdown, TXT
-- (KNOWLEDGE_FILE_MIME_TYPES). No Storage policies for anon or authenticated:
-- RLS on storage.objects then denies them everything. The server uses one-time
-- signed upload URLs and the service role.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'knowledge',
  'knowledge',
  false,
  10485760,
  array['application/pdf', 'text/markdown', 'text/plain']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- reserve_knowledge_source --------------------------------------------------
-- Locks the project row, so two reserves for the same project run one after the
-- other: the second counts the first one's source and is refused at the limit.
-- An `uploading` reservation older than 2 hours is dead (its upload was never
-- finalized): its row is deleted first so the slot is free again. A refusal
-- rolls that delete back, which only means it is retried on the next call. The
-- file of a reclaimed reservation, if one was uploaded, stays in Storage for the
-- server to clean up.
-- Every status counts toward the limit. Files start as `uploading` with
-- storage_key `<project_id>/<source_id>.<type>`; pasted text starts as
-- `processing` with no storage_key. p_type must be a knowledge_sources type
-- (anything else fails the table's check constraint, 23514).

create function public.reserve_knowledge_source(
  p_project_id uuid,
  p_title text,
  p_type text,
  p_max_sources integer
)
returns public.knowledge_sources
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_source public.knowledge_sources;
begin
  if p_max_sources is null then
    raise exception 'p_max_sources is required' using errcode = '22023';
  end if;

  perform 1 from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'project_not_found' using errcode = 'AW004';
  end if;

  delete from public.knowledge_sources
  where project_id = p_project_id
    and status = 'uploading'
    and created_at < now() - interval '2 hours';

  if (select count(*) from public.knowledge_sources where project_id = p_project_id) >= p_max_sources then
    raise exception 'source_limit_reached' using errcode = 'AW003';
  end if;

  insert into public.knowledge_sources (id, project_id, title, type, storage_key, status)
  values (
    v_id,
    p_project_id,
    p_title,
    p_type,
    case when p_type = 'text' then null else p_project_id::text || '/' || v_id::text || '.' || p_type end,
    case when p_type = 'text' then 'processing' else 'uploading' end
  )
  returning * into v_source;

  return v_source;
end;
$$;

-- consume_message -----------------------------------------------------------
-- One UPDATE decides and writes, so concurrent messages can't both pass the
-- limit. A period older than one month starts over (this message is the first of
-- the new period); otherwise the count goes up only while it is below p_limit.
-- Returns false, and changes nothing, when the quota is used up, when p_limit is
-- below 1, or when there is no such project (the route has already checked the
-- key).

create function public.consume_message(
  p_project_id uuid,
  p_limit integer
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_limit is null then
    raise exception 'p_limit is required' using errcode = '22023';
  end if;

  update public.projects
  set period_start = case when period_start < now() - interval '1 month' then now() else period_start end,
      messages_used = case when period_start < now() - interval '1 month' then 1 else messages_used + 1 end
  where id = p_project_id
    and ((period_start < now() - interval '1 month' and p_limit >= 1) or messages_used < p_limit);

  return found;
end;
$$;

-- save_chat_turn ------------------------------------------------------------
-- A null p_conversation_id starts a conversation for p_visitor_id. A given id
-- must belong to p_project_id, otherwise AW005 and nothing is written. Returns
-- the conversation id. The visitor message gets the current clock time and the
-- bot's reply exactly one microsecond later (now() would give both the
-- transaction's time, and two clock reads can tie on a coarse clock), so the
-- visitor message always sorts before the bot's reply.

create function public.save_chat_turn(
  p_project_id uuid,
  p_conversation_id uuid,
  p_visitor_id text,
  p_visitor_message text,
  p_bot_reply text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_conversation_id uuid := p_conversation_id;
  v_at timestamptz := clock_timestamp();
begin
  if v_conversation_id is null then
    insert into public.conversations (project_id, visitor_id)
    values (p_project_id, p_visitor_id)
    returning id into v_conversation_id;
  else
    perform 1
    from public.conversations
    where id = v_conversation_id and project_id = p_project_id;
    if not found then
      raise exception 'conversation_not_found' using errcode = 'AW005';
    end if;
  end if;

  insert into public.messages (conversation_id, role, body, created_at)
  values (v_conversation_id, 'visitor', p_visitor_message, v_at);
  insert into public.messages (conversation_id, role, body, created_at)
  values (v_conversation_id, 'bot', p_bot_reply, v_at + interval '1 microsecond');

  return v_conversation_id;
end;
$$;

-- match_chunks --------------------------------------------------------------
-- Cosine similarity (1 = same direction), best first. Only chunks of `ready`
-- sources in p_project_id: another project's chunks and chunks of a source that
-- is still processing or failed are never returned.

create function public.match_chunks(
  p_project_id uuid,
  p_embedding extensions.vector(1536),
  p_count integer
)
returns table (id uuid, source_id uuid, content text, similarity double precision)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_count is null or p_count < 1 then
    raise exception 'p_count must be at least 1' using errcode = '22023';
  end if;

  return query
  select c.id,
         c.source_id,
         c.content,
         1 - (c.embedding operator(extensions.<=>) p_embedding) as similarity
  from public.knowledge_chunks c
  join public.knowledge_sources s on s.id = c.source_id and s.project_id = c.project_id
  where c.project_id = p_project_id
    and s.status = 'ready'
  order by c.embedding operator(extensions.<=>) p_embedding
  limit p_count;
end;
$$;

-- Access --------------------------------------------------------------------
-- Only the server (service_role) may call these, after the route checked the
-- project and the plan.

revoke all on function public.reserve_knowledge_source(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.consume_message(uuid, integer) from public, anon, authenticated;
revoke all on function public.save_chat_turn(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.match_chunks(uuid, extensions.vector, integer) from public, anon, authenticated;

grant execute on function public.reserve_knowledge_source(uuid, text, text, integer) to service_role;
grant execute on function public.consume_message(uuid, integer) to service_role;
grant execute on function public.save_chat_turn(uuid, uuid, text, text, text) to service_role;
grant execute on function public.match_chunks(uuid, extensions.vector, integer) to service_role;
