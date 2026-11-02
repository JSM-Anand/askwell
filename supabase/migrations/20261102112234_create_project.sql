-- create_project: creates a project under the plan's project limit.
--
-- The route generates the public key (Node crypto) and passes it in, and passes
-- the limit from PLAN_LIMITS. The owner's accounts row is locked first, so two
-- creates for the same owner run one after the other: the second one counts the
-- first one's project and is refused at the limit.
--
-- Errors the route can recognise (PostgREST returns the SQLSTATE as `code`):
--   AW001  project_limit_reached  the owner already has p_max_projects projects
--   AW002  account_not_found      no accounts row for p_owner_id
-- A duplicate public_key raises the standard unique_violation (23505).

create function public.create_project(
  p_owner_id text,
  p_name text,
  p_public_key text,
  p_max_projects integer
)
returns public.projects
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_project public.projects;
begin
  if p_max_projects is null then
    raise exception 'p_max_projects is required' using errcode = '22023';
  end if;

  perform 1 from public.accounts where clerk_user_id = p_owner_id for update;
  if not found then
    raise exception 'account_not_found' using errcode = 'AW002';
  end if;

  if (select count(*) from public.projects where owner_id = p_owner_id) >= p_max_projects then
    raise exception 'project_limit_reached' using errcode = 'AW001';
  end if;

  insert into public.projects (owner_id, name, public_key)
  values (p_owner_id, p_name, p_public_key)
  returning * into v_project;

  insert into public.widget_configs (project_id) values (v_project.id);

  return v_project;
end;
$$;

-- Only the server (service_role) may call it, after the route checked the plan.
revoke all on function public.create_project(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.create_project(text, text, text, integer) to service_role;
