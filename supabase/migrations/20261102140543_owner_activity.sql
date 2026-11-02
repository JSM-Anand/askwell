-- owner_activity: the Conversations list. For one project, its conversations newest first, each with its
-- message count and a preview of the first visitor message.
--
-- It runs as the caller (SECURITY INVOKER), so the RLS policies decide what is visible: a project the caller
-- doesn't own returns no rows, not an error. The count and the preview are computed here because PostgREST
-- aggregates stay off project-wide (project.md §9).
--
--   p_limit  how many conversations, newest first. Defaults to 50 and is capped at 200. null means the
--            default; zero or a negative number returns no rows.
--   first_message_preview  the first 140 characters of the earliest visitor message, or null when the
--            conversation has none (no messages yet, or only bot messages).

create function public.owner_activity(p_project_id uuid, p_limit integer default 50)
returns table (
  id uuid,
  visitor_id text,
  created_at timestamptz,
  message_count bigint,
  first_message_preview text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id,
         c.visitor_id,
         c.created_at,
         (select count(*) from public.messages m where m.conversation_id = c.id) as message_count,
         (select left(m.body, 140)
          from public.messages m
          where m.conversation_id = c.id and m.role = 'visitor'
          order by m.created_at asc, m.id asc
          limit 1) as first_message_preview
  from public.conversations c
  where c.project_id = p_project_id
  order by c.created_at desc, c.id desc
  limit least(greatest(coalesce(p_limit, 50), 0), 200)
$$;

-- Owners call it with their Clerk token; the server may too. Never anon.
revoke all on function public.owner_activity(uuid, integer) from public, anon;
grant execute on function public.owner_activity(uuid, integer) to authenticated, service_role;
