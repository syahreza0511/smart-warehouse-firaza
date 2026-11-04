-- Profiles and authorization foundation (STACK-DECISION-LOG ADR-09, ADR-11,
-- ADR-13 and its OD-29 amendment; DATABASE-DESIGN §4.0, §4.1, §12.1, §12.2,
-- §12.5, §14.2 step 1).
--
-- Table, RLS, policy, and grants are created together in this one file
-- (ADR-13 D4). Do not add explicit transaction control or batch-splitting
-- statements to this file (DATABASE-DESIGN §14.1).

-- ---------------------------------------------------------------------------
-- Private schema (ADR-13 D2). Not listed in the Data API schemas.
-- ---------------------------------------------------------------------------
create schema app_private;

revoke all on schema app_private from public;

-- RLS policies run with the caller's privileges and call the role helper, so
-- authenticated needs USAGE here (ADR-13 D8). No table in this schema is
-- granted to authenticated.
grant usage on schema app_private to authenticated;

-- ---------------------------------------------------------------------------
-- Enum (DATABASE-DESIGN §4.0)
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('OWNER', 'STAFF_WAREHOUSE');

-- ---------------------------------------------------------------------------
-- updated_at trigger function (DATABASE-DESIGN §1.2)
-- ---------------------------------------------------------------------------
create function app_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function app_private.set_updated_at() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- profiles (DATABASE-DESIGN §4.1)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  name text not null check (pg_catalog.btrim(name) <> ''),
  role public.user_role not null,
  -- NULL means active. Set and cleared only by the admin runbook (§12.5).
  deactivated_at timestamptz,
  -- PROPOSED, REQUIRES INTEGRATION TEST (§12.5.3): only Auth sessions created
  -- after this time are accepted. Set on reactivation.
  session_valid_after timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function app_private.set_updated_at();

alter table public.profiles enable row level security;

-- Default-deny is set by the baseline migration; these revokes keep the table
-- closed even where default privileges differ (for example on the cloud
-- project). service_role receives nothing: provisioning and account status
-- changes run through a trusted SQL session (§12.5.5–§12.5.7).
revoke all on table public.profiles from public, anon, authenticated, service_role;

-- Read only. No INSERT, UPDATE, or DELETE for authenticated, so users cannot
-- change role, deactivated_at, or session_valid_after (§12.2).
grant select on table public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Role helper (DATABASE-DESIGN §12.1, §12.5.2)
--
-- Returns the caller's application role, or NULL when any check fails
-- (fail-closed). Runs as its owner (postgres, which has BYPASSRLS) so it can
-- read public.profiles without triggering the profiles policy (no recursion)
-- and read session metadata from auth.sessions, which authenticated cannot
-- read.
--
-- Depends on Supabase-managed objects: auth.jwt(), the access-token claims
-- `sub` and `session_id`, and auth.sessions (id, user_id, created_at,
-- not_after). Verified against Supabase Auth v2.197.0 source and the local
-- catalog only; re-run DATABASE-DESIGN §14.5 tests after every Supabase
-- upgrade.
--
-- Reads metadata only; never creates, updates, or deletes Auth sessions.
-- ---------------------------------------------------------------------------
create function app_private.current_app_role()
returns public.user_role
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uuid_pattern constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  claims jsonb;
  sub_text text;
  session_text text;
  caller_id uuid;
  caller_session_id uuid;
  caller_role public.user_role;
begin
  -- Claims are set by PostgREST from a verified JWT. A malformed claims
  -- setting is treated as unauthenticated instead of raising.
  begin
    claims := auth.jwt();
  exception
    when invalid_text_representation then
      return null;
  end;

  if claims is null or pg_catalog.jsonb_typeof(claims) <> 'object' then
    return null;
  end if;

  sub_text := claims ->> 'sub';
  session_text := claims ->> 'session_id';

  -- Missing or malformed identifiers are rejected before any cast.
  if sub_text is null or sub_text !~ uuid_pattern then
    return null;
  end if;

  if session_text is null or session_text !~ uuid_pattern then
    return null;
  end if;

  caller_id := sub_text::uuid;
  caller_session_id := session_text::uuid;

  select p.role
    into caller_role
    from public.profiles as p
    join auth.sessions as s
      on s.id = caller_session_id
     and s.user_id = p.id
   where p.id = caller_id
     and p.deactivated_at is null
     and s.created_at is not null
     and (s.not_after is null or s.not_after > pg_catalog.now())
     and (p.session_valid_after is null or s.created_at > p.session_valid_after);

  if caller_role is null or caller_role not in ('OWNER', 'STAFF_WAREHOUSE') then
    return null;
  end if;

  return caller_role;
end;
$$;

revoke all on function app_private.current_app_role() from public, anon, authenticated, service_role;

-- Needed because RLS policies evaluate the helper with the caller's privileges.
grant execute on function app_private.current_app_role() to authenticated;

-- ---------------------------------------------------------------------------
-- profiles policy (DATABASE-DESIGN §12.2)
--
-- Own row only, and only while the helper accepts the caller: no profile,
-- a deactivated profile, or an invalid session yields no rows. Profiles of
-- other users follow OD-28 and are not readable yet.
-- ---------------------------------------------------------------------------
create policy profiles_select_own_active
  on public.profiles
  for select
  to authenticated
  using (
    id = (select auth.uid())
    and (select app_private.current_app_role()) is not null
  );
