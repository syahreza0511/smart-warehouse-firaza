-- Account lifecycle admin procedures (STACK-DECISION-LOG ADR-14 J1, J3–J9,
-- J11 and its J5 update; DATABASE-DESIGN §4.11, §12.5.4–§12.5.10, §14.2
-- step 1a).
--
-- Additive: does not change the two earlier migrations, public.profiles, or
-- app_private.current_app_role(). Table, RLS, revokes, triggers, functions,
-- and the final privilege check are written together in this one file
-- (ADR-13 D4). Do not add explicit transaction control or batch-splitting
-- statements to this file (DATABASE-DESIGN §14.1).
--
-- Administrative authority is a trusted SQL session as `postgres` plus the
-- Auth Admin API from a trusted script (ADR-14 J3). Nothing here is reachable
-- through the Data API: app_private is not exposed and no API role receives
-- EXECUTE or table privileges.
--
-- Guarantees end at COMMIT. PostgreSQL and the Auth Admin API never share a
-- transaction; the advisory lock does not cover Auth HTTP calls made after
-- commit (§12.5.9, §12.5.10).

-- ---------------------------------------------------------------------------
-- Lifecycle event table (DATABASE-DESIGN §4.11; ADR-14 J1, J5, J11)
--
-- No FK to auth.users, so history survives deletion of disposable test
-- accounts (J11). actor is self-declared by the operator, not an
-- authenticated identity. request_fingerprint detects changed input for a
-- reused operation_id; it is not confidentiality protection (§12.5.9).
-- ---------------------------------------------------------------------------
create table app_private.account_lifecycle_events (
  id bigint generated always as identity primary key,
  operation_id uuid not null unique,
  request_fingerprint text not null
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz not null default pg_catalog.clock_timestamp(),
  action text not null
    check (action in ('PROVISION', 'DEACTIVATE', 'REACTIVATE', 'SET_ROLE')),
  outcome text not null
    check (outcome in ('APPLIED', 'NOOP')),
  target_user_id uuid not null,
  actor text not null
    check (pg_catalog.btrim(actor) <> '' and pg_catalog.char_length(actor) <= 100),
  reason text not null
    check (pg_catalog.btrim(reason) <> '' and pg_catalog.char_length(reason) <= 500),
  old_role public.user_role,
  new_role public.user_role,
  old_deactivated_at timestamptz,
  new_deactivated_at timestamptz,
  old_session_valid_after timestamptz,
  new_session_valid_after timestamptz,
  db_session_user text not null default session_user
);

create index account_lifecycle_events_target_idx
  on app_private.account_lifecycle_events (target_user_id, id);

alter table app_private.account_lifecycle_events enable row level security;

-- No policy: RLS denies every API role. The owner (postgres) is not subject
-- to RLS here; access control for it is the function contract and runbook.
revoke all on table app_private.account_lifecycle_events
  from public, anon, authenticated, service_role;

revoke all on sequence app_private.account_lifecycle_events_id_seq
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Append-only guard (§4.11)
--
-- Rejects ordinary UPDATE, DELETE, and TRUNCATE. ENABLE ALWAYS keeps the
-- triggers active under session_replication_role = replica. The table owner
-- (postgres) and superusers can still disable or drop these triggers; this
-- is not tamper-proofing against them.
-- ---------------------------------------------------------------------------
create function app_private.account_lifecycle_events_reject_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'APPEND_ONLY';
end;
$$;

revoke all on function app_private.account_lifecycle_events_reject_change()
  from public, anon, authenticated, service_role;

create trigger account_lifecycle_events_no_update_delete
  before update or delete on app_private.account_lifecycle_events
  for each row
  execute function app_private.account_lifecycle_events_reject_change();

create trigger account_lifecycle_events_no_truncate
  before truncate on app_private.account_lifecycle_events
  for each statement
  execute function app_private.account_lifecycle_events_reject_change();

alter table app_private.account_lifecycle_events
  enable always trigger account_lifecycle_events_no_update_delete;

alter table app_private.account_lifecycle_events
  enable always trigger account_lifecycle_events_no_truncate;

-- ---------------------------------------------------------------------------
-- Trusted context guard (§12.5.8; ADR-14 J3)
--
-- SECURITY INVOKER, so current_user is the caller's effective role. The
-- positive check is current_user = 'postgres' (verified locally only; the
-- cloud SQL role must be verified before remote use). request.jwt.claims is
-- an extra signal of a PostgREST call, never an identity credential.
-- ---------------------------------------------------------------------------
create function app_private.admin_assert_trusted_context()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user <> 'postgres' then
    raise exception using errcode = 'P0001', message = 'UNTRUSTED_CONTEXT';
  end if;

  if coalesce(pg_catalog.current_setting('request.jwt.claims', true), '') <> '' then
    raise exception using errcode = 'P0001', message = 'UNTRUSTED_CONTEXT';
  end if;
end;
$$;

revoke all on function app_private.admin_assert_trusted_context()
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Read-only account state (§12.5.4, §12.5.8)
--
-- No advisory lock. Never returns the email address, tokens, secrets, or the
-- request fingerprint. derived_status INCONSISTENT_ACTIVE_BANNED exposes the
-- case where the database is active but an Auth ban is still in force, so an
-- ALREADY_ACTIVE result is never mistaken for a completed reactivation.
-- ---------------------------------------------------------------------------
create function app_private.admin_get_account_state(
  p_user_id uuid,
  p_operation_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_auth_exists boolean := false;
  v_email_confirmed boolean;
  v_banned_until timestamptz;
  v_banned boolean;
  v_profile public.profiles%rowtype;
  v_profile_exists boolean := false;
  v_status text;
  v_active_owners bigint;
  v_session_count bigint;
  v_latest_event jsonb;
  v_operation_event jsonb;
begin
  perform app_private.admin_assert_trusted_context();

  if p_user_id is null then
    raise exception using errcode = 'P0001', message = 'INVALID_ARGUMENT';
  end if;

  select u.email_confirmed_at is not null, u.banned_until
    into v_email_confirmed, v_banned_until
    from auth.users as u
   where u.id = p_user_id;
  v_auth_exists := found;

  v_banned := v_banned_until is not null and v_banned_until > v_now;

  select p.*
    into v_profile
    from public.profiles as p
   where p.id = p_user_id;
  v_profile_exists := found;

  v_status := case
    when not v_auth_exists then 'NOT_FOUND'
    when not v_profile_exists then 'AUTH_ONLY_NO_PROFILE'
    when v_profile.deactivated_at is null and not v_banned then 'ACTIVE'
    when v_profile.deactivated_at is null and v_banned then 'INCONSISTENT_ACTIVE_BANNED'
    when not v_banned then 'DEACTIVATED_NOT_BANNED'
    else 'DEACTIVATED'
  end;

  select pg_catalog.count(*)
    into v_active_owners
    from public.profiles as p
   where p.role = 'OWNER'
     and p.deactivated_at is null;

  select pg_catalog.count(*)
    into v_session_count
    from auth.sessions as s
   where s.user_id = p_user_id;

  select pg_catalog.jsonb_build_object(
           'event_id', e.id,
           'operation_id', e.operation_id,
           'occurred_at', e.occurred_at,
           'action', e.action,
           'outcome', e.outcome,
           'result', case e.action || '/' || e.outcome
             when 'PROVISION/APPLIED' then 'PROVISIONED'
             when 'DEACTIVATE/APPLIED' then 'DEACTIVATED'
             when 'DEACTIVATE/NOOP' then 'ALREADY_DEACTIVATED'
             when 'REACTIVATE/APPLIED' then 'REACTIVATED'
             when 'REACTIVATE/NOOP' then 'ALREADY_ACTIVE'
             when 'SET_ROLE/APPLIED' then 'ROLE_CHANGED'
             when 'SET_ROLE/NOOP' then 'ROLE_UNCHANGED'
           end,
           'target_user_id', e.target_user_id,
           'actor', e.actor,
           'reason', e.reason,
           'old_role', e.old_role,
           'new_role', e.new_role,
           'old_deactivated_at', e.old_deactivated_at,
           'new_deactivated_at', e.new_deactivated_at,
           'old_session_valid_after', e.old_session_valid_after,
           'new_session_valid_after', e.new_session_valid_after,
           'db_session_user', e.db_session_user)
    into v_latest_event
    from app_private.account_lifecycle_events as e
   where e.target_user_id = p_user_id
   order by e.id desc
   limit 1;

  if p_operation_id is not null then
    select pg_catalog.jsonb_build_object(
             'event_id', e.id,
             'operation_id', e.operation_id,
             'occurred_at', e.occurred_at,
             'action', e.action,
             'outcome', e.outcome,
             'result', case e.action || '/' || e.outcome
               when 'PROVISION/APPLIED' then 'PROVISIONED'
               when 'DEACTIVATE/APPLIED' then 'DEACTIVATED'
               when 'DEACTIVATE/NOOP' then 'ALREADY_DEACTIVATED'
               when 'REACTIVATE/APPLIED' then 'REACTIVATED'
               when 'REACTIVATE/NOOP' then 'ALREADY_ACTIVE'
               when 'SET_ROLE/APPLIED' then 'ROLE_CHANGED'
               when 'SET_ROLE/NOOP' then 'ROLE_UNCHANGED'
             end,
             'target_user_id', e.target_user_id,
             'actor', e.actor,
             'reason', e.reason,
             'old_role', e.old_role,
             'new_role', e.new_role,
             'old_deactivated_at', e.old_deactivated_at,
             'new_deactivated_at', e.new_deactivated_at,
             'old_session_valid_after', e.old_session_valid_after,
             'new_session_valid_after', e.new_session_valid_after,
             'db_session_user', e.db_session_user)
      into v_operation_event
      from app_private.account_lifecycle_events as e
     where e.operation_id = p_operation_id;
  end if;

  return pg_catalog.jsonb_build_object(
    'user_id', p_user_id,
    'checked_at', v_now,
    'auth_user_exists', v_auth_exists,
    'email_confirmed', v_email_confirmed,
    'banned_until', v_banned_until,
    'auth_banned', v_banned,
    'profile_exists', v_profile_exists,
    'role', v_profile.role,
    'deactivated_at', v_profile.deactivated_at,
    'session_valid_after', v_profile.session_valid_after,
    'derived_status', v_status,
    'active_owner_count', v_active_owners,
    'auth_session_count', v_session_count,
    'latest_event', v_latest_event,
    'operation_event', v_operation_event
  );
end;
$$;

revoke all on function app_private.admin_get_account_state(uuid, uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Mutation functions: shared contract (§12.5.8, §12.5.9, §12.5.10)
--
-- Mandatory order in every mutation function:
--   1. admin_assert_trusted_context()
--   2. validate and normalize arguments (btrim name/actor/reason, lower+btrim
--      email, reject NULLs and infinite timestamps)
--   3. request_fingerprint = sha256 of the versioned canonical jsonb
--      (firaza.admin_lifecycle.v1; timestamps as UTC with microseconds;
--      every field present, NULL as JSON null; operation_id, current time,
--      and session data excluded)
--   4. pg_advisory_xact_lock(1179795802, 29), reserved for these functions
--   5. operation_id lookup: different fingerprint -> OPERATION_ID_CONFLICT;
--      same fingerprint -> historical result with replayed = true, no
--      profile change and no new event, whatever the current state
--   6. lock the target profile row (FOR UPDATE)
--   7. expected-state check (NULL-safe), always before the NOOP path
--   8. NOOP path
--   9. Auth ban check / last active OWNER check where relevant
--  10. profile write and exactly one event in the same transaction
--
-- Business errors: SQLSTATE P0001 with a stable code as MESSAGE and no
-- DETAIL or HINT. Infrastructure errors (55P03 lock_timeout, 40P01 deadlock,
-- lost connection) keep their own SQLSTATE. Any error rolls back the whole
-- transaction, so rejections never write an event.
--
-- Detection limit: OPERATION_ID_CONFLICT works only once an operation_id has
-- an event. An id from a rejected or failed attempt has none; the runbook
-- requires a new operation_id after a P0001 rejection.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Provisioning (§12.5.6 "Provisioning profil", §12.5.8; ADR-14 J8)
--
-- No trigger on auth.users creates profiles (ADR-11). session_valid_after is
-- set to clock_timestamp() on insert, so sessions created while the account
-- had no profile never receive application authorization. Provisioning
-- never lowers the active OWNER count, so the first OWNER is allowed.
-- auth.users is read only, never locked or written.
-- ---------------------------------------------------------------------------
create function app_private.admin_provision_profile(
  p_user_id uuid,
  p_expected_email text,
  p_name text,
  p_role public.user_role,
  p_actor text,
  p_reason text,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_email text;
  v_name text;
  v_actor text;
  v_reason text;
  v_fingerprint text;
  v_event app_private.account_lifecycle_events%rowtype;
  v_auth_email text;
  v_email_confirmed_at timestamptz;
  v_banned_until timestamptz;
  v_profile public.profiles%rowtype;
  v_event_id bigint;
begin
  -- 1. Trusted context.
  perform app_private.admin_assert_trusted_context();

  -- 2. Validate and normalize.
  v_email := pg_catalog.lower(pg_catalog.btrim(p_expected_email));
  v_name := pg_catalog.btrim(p_name);
  v_actor := pg_catalog.btrim(p_actor);
  v_reason := pg_catalog.btrim(p_reason);

  if p_user_id is null
     or p_operation_id is null
     or p_role is null
     or v_email is null or v_email = '' or pg_catalog.char_length(v_email) > 320
     or v_name is null or v_name = '' or pg_catalog.char_length(v_name) > 100
     or v_actor is null or v_actor = '' or pg_catalog.char_length(v_actor) > 100
     or v_reason is null or v_reason = '' or pg_catalog.char_length(v_reason) > 500 then
    raise exception using errcode = 'P0001', message = 'INVALID_ARGUMENT';
  end if;

  -- 3. Fingerprint.
  v_fingerprint := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
      'v', 'firaza.admin_lifecycle.v1',
      'action', 'PROVISION',
      'target_user_id', p_user_id::text,
      'expected_email', v_email,
      'name', v_name,
      'role', p_role::text,
      'actor', v_actor,
      'reason', v_reason
    )::text, 'UTF8')),
    'hex');

  -- 4. Shared advisory lock.
  perform pg_catalog.pg_advisory_xact_lock(1179795802, 29);

  -- 5. operation_id and replay.
  select e.*
    into v_event
    from app_private.account_lifecycle_events as e
   where e.operation_id = p_operation_id;

  if found then
    if v_event.request_fingerprint <> v_fingerprint
       or v_event.action <> 'PROVISION'
       or v_event.target_user_id <> p_user_id then
      raise exception using errcode = 'P0001', message = 'OPERATION_ID_CONFLICT';
    end if;

    return pg_catalog.jsonb_build_object(
      'result', 'PROVISIONED',
      'outcome', v_event.outcome,
      'replayed', true,
      'operation_id', v_event.operation_id,
      'event_id', v_event.id,
      'user_id', v_event.target_user_id,
      'role', v_event.new_role,
      'deactivated_at', v_event.new_deactivated_at,
      'session_valid_after', v_event.new_session_valid_after
    );
  end if;

  -- 6. Auth account and existing profile. A missing account and a different
  -- email give the same code so the response does not reveal which.
  select u.email::text, u.email_confirmed_at, u.banned_until
    into v_auth_email, v_email_confirmed_at, v_banned_until
    from auth.users as u
   where u.id = p_user_id;

  if not found or pg_catalog.lower(v_auth_email) is distinct from v_email then
    raise exception using errcode = 'P0001', message = 'INVALID_ARGUMENT';
  end if;

  perform 1
     from public.profiles as p
    where p.id = p_user_id
      for update;

  if found then
    raise exception using errcode = 'P0001', message = 'STATE_CONFLICT';
  end if;

  -- 7. Expected state: the account email must be confirmed.
  if v_email_confirmed_at is null then
    raise exception using errcode = 'P0001', message = 'STATE_CONFLICT';
  end if;

  -- 8. No NOOP path: an existing profile is always STATE_CONFLICT.

  -- 9. Point-in-time Auth ban check.
  if v_banned_until is not null and v_banned_until > pg_catalog.clock_timestamp() then
    raise exception using errcode = 'P0001', message = 'AUTH_STILL_BANNED';
  end if;

  -- 10. Profile and event, same transaction.
  insert into public.profiles (id, name, role, deactivated_at, session_valid_after)
  values (p_user_id, v_name, p_role, null, pg_catalog.clock_timestamp())
  returning * into v_profile;

  insert into app_private.account_lifecycle_events (
    operation_id, request_fingerprint, action, outcome, target_user_id,
    actor, reason,
    old_role, new_role,
    old_deactivated_at, new_deactivated_at,
    old_session_valid_after, new_session_valid_after
  )
  values (
    p_operation_id, v_fingerprint, 'PROVISION', 'APPLIED', p_user_id,
    v_actor, v_reason,
    null, v_profile.role,
    null, v_profile.deactivated_at,
    null, v_profile.session_valid_after
  )
  returning id into v_event_id;

  return pg_catalog.jsonb_build_object(
    'result', 'PROVISIONED',
    'outcome', 'APPLIED',
    'replayed', false,
    'operation_id', p_operation_id,
    'event_id', v_event_id,
    'user_id', p_user_id,
    'role', v_profile.role,
    'deactivated_at', v_profile.deactivated_at,
    'session_valid_after', v_profile.session_valid_after
  );
end;
$$;

revoke all on function app_private.admin_provision_profile(uuid, text, text, public.user_role, text, text, uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Deactivation (§12.5.5, §12.5.8, §12.5.10)
--
-- The expected session_valid_after is compared NULL-safe before the NOOP
-- path, so a command built before a later reactivation is STATE_CONFLICT.
-- ALREADY_DEACTIVATED keeps the original deactivated_at. session_valid_after
-- is never changed here.
-- ---------------------------------------------------------------------------
create function app_private.admin_deactivate_account(
  p_user_id uuid,
  p_expected_session_valid_after timestamptz,
  p_actor text,
  p_reason text,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_actor text;
  v_reason text;
  v_fingerprint text;
  v_event app_private.account_lifecycle_events%rowtype;
  v_profile public.profiles%rowtype;
  v_updated public.profiles%rowtype;
  v_other_active_owners bigint;
  v_event_id bigint;
begin
  -- 1. Trusted context.
  perform app_private.admin_assert_trusted_context();

  -- 2. Validate and normalize. The expected value may be NULL.
  v_actor := pg_catalog.btrim(p_actor);
  v_reason := pg_catalog.btrim(p_reason);

  if p_user_id is null
     or p_operation_id is null
     or (p_expected_session_valid_after is not null
         and not pg_catalog.isfinite(p_expected_session_valid_after))
     or v_actor is null or v_actor = '' or pg_catalog.char_length(v_actor) > 100
     or v_reason is null or v_reason = '' or pg_catalog.char_length(v_reason) > 500 then
    raise exception using errcode = 'P0001', message = 'INVALID_ARGUMENT';
  end if;

  -- 3. Fingerprint.
  v_fingerprint := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
      'v', 'firaza.admin_lifecycle.v1',
      'action', 'DEACTIVATE',
      'target_user_id', p_user_id::text,
      'expected_session_valid_after', pg_catalog.to_char(
        p_expected_session_valid_after at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'actor', v_actor,
      'reason', v_reason
    )::text, 'UTF8')),
    'hex');

  -- 4. Shared advisory lock.
  perform pg_catalog.pg_advisory_xact_lock(1179795802, 29);

  -- 5. operation_id and replay. A replay never re-applies, even if the
  -- account was reactivated after the original deactivation.
  select e.*
    into v_event
    from app_private.account_lifecycle_events as e
   where e.operation_id = p_operation_id;

  if found then
    if v_event.request_fingerprint <> v_fingerprint
       or v_event.action <> 'DEACTIVATE'
       or v_event.target_user_id <> p_user_id then
      raise exception using errcode = 'P0001', message = 'OPERATION_ID_CONFLICT';
    end if;

    return pg_catalog.jsonb_build_object(
      'result', case v_event.outcome
                  when 'APPLIED' then 'DEACTIVATED'
                  else 'ALREADY_DEACTIVATED'
                end,
      'outcome', v_event.outcome,
      'replayed', true,
      'operation_id', v_event.operation_id,
      'event_id', v_event.id,
      'user_id', v_event.target_user_id,
      'role', v_event.new_role,
      'deactivated_at', v_event.new_deactivated_at,
      'session_valid_after', v_event.new_session_valid_after
    );
  end if;

  -- 6. Lock the target.
  select p.*
    into v_profile
    from public.profiles as p
   where p.id = p_user_id
     for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'PROFILE_NOT_FOUND';
  end if;

  -- 7. Expected state, NULL-safe, before the NOOP path.
  if v_profile.session_valid_after is distinct from p_expected_session_valid_after then
    raise exception using errcode = 'P0001', message = 'STATE_CONFLICT';
  end if;

  -- 8. NOOP: already deactivated; keep the original deactivated_at.
  if v_profile.deactivated_at is not null then
    insert into app_private.account_lifecycle_events (
      operation_id, request_fingerprint, action, outcome, target_user_id,
      actor, reason,
      old_role, new_role,
      old_deactivated_at, new_deactivated_at,
      old_session_valid_after, new_session_valid_after
    )
    values (
      p_operation_id, v_fingerprint, 'DEACTIVATE', 'NOOP', p_user_id,
      v_actor, v_reason,
      v_profile.role, v_profile.role,
      v_profile.deactivated_at, v_profile.deactivated_at,
      v_profile.session_valid_after, v_profile.session_valid_after
    )
    returning id into v_event_id;

    return pg_catalog.jsonb_build_object(
      'result', 'ALREADY_DEACTIVATED',
      'outcome', 'NOOP',
      'replayed', false,
      'operation_id', p_operation_id,
      'event_id', v_event_id,
      'user_id', p_user_id,
      'role', v_profile.role,
      'deactivated_at', v_profile.deactivated_at,
      'session_valid_after', v_profile.session_valid_after
    );
  end if;

  -- 9. Last active OWNER. The target row is already locked; lock every
  -- active OWNER in id order, then count the others.
  if v_profile.role = 'OWNER' then
    perform 1
       from public.profiles as p
      where p.role = 'OWNER'
        and p.deactivated_at is null
      order by p.id
        for update;

    select pg_catalog.count(*)
      into v_other_active_owners
      from public.profiles as p
     where p.role = 'OWNER'
       and p.deactivated_at is null
       and p.id <> p_user_id;

    if v_other_active_owners = 0 then
      raise exception using errcode = 'P0001', message = 'LAST_ACTIVE_OWNER';
    end if;
  end if;

  -- 10. Profile and event, same transaction.
  update public.profiles as p
     set deactivated_at = pg_catalog.clock_timestamp()
   where p.id = p_user_id
  returning p.* into v_updated;

  insert into app_private.account_lifecycle_events (
    operation_id, request_fingerprint, action, outcome, target_user_id,
    actor, reason,
    old_role, new_role,
    old_deactivated_at, new_deactivated_at,
    old_session_valid_after, new_session_valid_after
  )
  values (
    p_operation_id, v_fingerprint, 'DEACTIVATE', 'APPLIED', p_user_id,
    v_actor, v_reason,
    v_profile.role, v_updated.role,
    v_profile.deactivated_at, v_updated.deactivated_at,
    v_profile.session_valid_after, v_updated.session_valid_after
  )
  returning id into v_event_id;

  return pg_catalog.jsonb_build_object(
    'result', 'DEACTIVATED',
    'outcome', 'APPLIED',
    'replayed', false,
    'operation_id', p_operation_id,
    'event_id', v_event_id,
    'user_id', p_user_id,
    'role', v_updated.role,
    'deactivated_at', v_updated.deactivated_at,
    'session_valid_after', v_updated.session_valid_after
  );
end;
$$;

revoke all on function app_private.admin_deactivate_account(uuid, timestamptz, text, text, uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Reactivation (§12.5.6 step 4, §12.5.8; ADR-14 J6)
--
-- NULL p_expected_deactivated_at means the operator explicitly expects an
-- active account; only then is ALREADY_ACTIVE returned, and the cutoff is
-- not advanced. ALREADY_ACTIVE says nothing about Auth: check
-- admin_get_account_state for INCONSISTENT_ACTIVE_BANNED before treating the
-- runbook operation as REACTIVATED. The ban check runs only when the account
-- is actually activated and is point-in-time (a later ban is not prevented).
-- ---------------------------------------------------------------------------
create function app_private.admin_reactivate_account(
  p_user_id uuid,
  p_expected_deactivated_at timestamptz,
  p_actor text,
  p_reason text,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_actor text;
  v_reason text;
  v_fingerprint text;
  v_event app_private.account_lifecycle_events%rowtype;
  v_profile public.profiles%rowtype;
  v_updated public.profiles%rowtype;
  v_banned_until timestamptz;
  v_event_id bigint;
begin
  -- 1. Trusted context.
  perform app_private.admin_assert_trusted_context();

  -- 2. Validate and normalize. The expected value may be NULL.
  v_actor := pg_catalog.btrim(p_actor);
  v_reason := pg_catalog.btrim(p_reason);

  if p_user_id is null
     or p_operation_id is null
     or (p_expected_deactivated_at is not null
         and not pg_catalog.isfinite(p_expected_deactivated_at))
     or v_actor is null or v_actor = '' or pg_catalog.char_length(v_actor) > 100
     or v_reason is null or v_reason = '' or pg_catalog.char_length(v_reason) > 500 then
    raise exception using errcode = 'P0001', message = 'INVALID_ARGUMENT';
  end if;

  -- 3. Fingerprint.
  v_fingerprint := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
      'v', 'firaza.admin_lifecycle.v1',
      'action', 'REACTIVATE',
      'target_user_id', p_user_id::text,
      'expected_deactivated_at', pg_catalog.to_char(
        p_expected_deactivated_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'actor', v_actor,
      'reason', v_reason
    )::text, 'UTF8')),
    'hex');

  -- 4. Shared advisory lock.
  perform pg_catalog.pg_advisory_xact_lock(1179795802, 29);

  -- 5. operation_id and replay. A replay never advances the cutoff again.
  select e.*
    into v_event
    from app_private.account_lifecycle_events as e
   where e.operation_id = p_operation_id;

  if found then
    if v_event.request_fingerprint <> v_fingerprint
       or v_event.action <> 'REACTIVATE'
       or v_event.target_user_id <> p_user_id then
      raise exception using errcode = 'P0001', message = 'OPERATION_ID_CONFLICT';
    end if;

    return pg_catalog.jsonb_build_object(
      'result', case v_event.outcome
                  when 'APPLIED' then 'REACTIVATED'
                  else 'ALREADY_ACTIVE'
                end,
      'outcome', v_event.outcome,
      'replayed', true,
      'operation_id', v_event.operation_id,
      'event_id', v_event.id,
      'user_id', v_event.target_user_id,
      'role', v_event.new_role,
      'deactivated_at', v_event.new_deactivated_at,
      'session_valid_after', v_event.new_session_valid_after
    );
  end if;

  -- 6. Lock the target.
  select p.*
    into v_profile
    from public.profiles as p
   where p.id = p_user_id
     for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'PROFILE_NOT_FOUND';
  end if;

  -- 7. Expected state, NULL-safe, before the NOOP path. A non-NULL
  -- expectation for an active account, or a different deactivation time,
  -- is a conflict.
  if v_profile.deactivated_at is distinct from p_expected_deactivated_at then
    raise exception using errcode = 'P0001', message = 'STATE_CONFLICT';
  end if;

  -- 8. NOOP: explicitly expected active and is active; cutoff unchanged.
  if v_profile.deactivated_at is null then
    insert into app_private.account_lifecycle_events (
      operation_id, request_fingerprint, action, outcome, target_user_id,
      actor, reason,
      old_role, new_role,
      old_deactivated_at, new_deactivated_at,
      old_session_valid_after, new_session_valid_after
    )
    values (
      p_operation_id, v_fingerprint, 'REACTIVATE', 'NOOP', p_user_id,
      v_actor, v_reason,
      v_profile.role, v_profile.role,
      v_profile.deactivated_at, v_profile.deactivated_at,
      v_profile.session_valid_after, v_profile.session_valid_after
    )
    returning id into v_event_id;

    return pg_catalog.jsonb_build_object(
      'result', 'ALREADY_ACTIVE',
      'outcome', 'NOOP',
      'replayed', false,
      'operation_id', p_operation_id,
      'event_id', v_event_id,
      'user_id', p_user_id,
      'role', v_profile.role,
      'deactivated_at', v_profile.deactivated_at,
      'session_valid_after', v_profile.session_valid_after
    );
  end if;

  -- 9. Point-in-time Auth ban check, only for an actual activation. The FK
  -- on profiles.id guarantees the Auth row exists.
  select u.banned_until
    into v_banned_until
    from auth.users as u
   where u.id = p_user_id;

  if v_banned_until is not null and v_banned_until > pg_catalog.clock_timestamp() then
    raise exception using errcode = 'P0001', message = 'AUTH_STILL_BANNED';
  end if;

  -- 10. Clear deactivated_at and set the new cutoff in one UPDATE, plus the
  -- event, same transaction.
  update public.profiles as p
     set deactivated_at = null,
         session_valid_after = pg_catalog.clock_timestamp()
   where p.id = p_user_id
  returning p.* into v_updated;

  insert into app_private.account_lifecycle_events (
    operation_id, request_fingerprint, action, outcome, target_user_id,
    actor, reason,
    old_role, new_role,
    old_deactivated_at, new_deactivated_at,
    old_session_valid_after, new_session_valid_after
  )
  values (
    p_operation_id, v_fingerprint, 'REACTIVATE', 'APPLIED', p_user_id,
    v_actor, v_reason,
    v_profile.role, v_updated.role,
    v_profile.deactivated_at, v_updated.deactivated_at,
    v_profile.session_valid_after, v_updated.session_valid_after
  )
  returning id into v_event_id;

  return pg_catalog.jsonb_build_object(
    'result', 'REACTIVATED',
    'outcome', 'APPLIED',
    'replayed', false,
    'operation_id', p_operation_id,
    'event_id', v_event_id,
    'user_id', p_user_id,
    'role', v_updated.role,
    'deactivated_at', v_updated.deactivated_at,
    'session_valid_after', v_updated.session_valid_after
  );
end;
$$;

revoke all on function app_private.admin_reactivate_account(uuid, timestamptz, text, text, uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Role change (§12.5.6 "Perubahan role", §12.5.8, §12.5.10)
--
-- p_expected_role is checked first: a stale expectation is STATE_CONFLICT
-- even when the current role already equals p_new_role. ROLE_UNCHANGED does
-- not UPDATE the profile. Demoting the last active OWNER is rejected; role
-- changes on a deactivated profile never lower the active OWNER count.
-- ---------------------------------------------------------------------------
create function app_private.admin_set_role(
  p_user_id uuid,
  p_expected_role public.user_role,
  p_new_role public.user_role,
  p_actor text,
  p_reason text,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_actor text;
  v_reason text;
  v_fingerprint text;
  v_event app_private.account_lifecycle_events%rowtype;
  v_profile public.profiles%rowtype;
  v_updated public.profiles%rowtype;
  v_other_active_owners bigint;
  v_event_id bigint;
begin
  -- 1. Trusted context.
  perform app_private.admin_assert_trusted_context();

  -- 2. Validate and normalize.
  v_actor := pg_catalog.btrim(p_actor);
  v_reason := pg_catalog.btrim(p_reason);

  if p_user_id is null
     or p_operation_id is null
     or p_expected_role is null
     or p_new_role is null
     or v_actor is null or v_actor = '' or pg_catalog.char_length(v_actor) > 100
     or v_reason is null or v_reason = '' or pg_catalog.char_length(v_reason) > 500 then
    raise exception using errcode = 'P0001', message = 'INVALID_ARGUMENT';
  end if;

  -- 3. Fingerprint.
  v_fingerprint := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
      'v', 'firaza.admin_lifecycle.v1',
      'action', 'SET_ROLE',
      'target_user_id', p_user_id::text,
      'expected_role', p_expected_role::text,
      'new_role', p_new_role::text,
      'actor', v_actor,
      'reason', v_reason
    )::text, 'UTF8')),
    'hex');

  -- 4. Shared advisory lock.
  perform pg_catalog.pg_advisory_xact_lock(1179795802, 29);

  -- 5. operation_id and replay.
  select e.*
    into v_event
    from app_private.account_lifecycle_events as e
   where e.operation_id = p_operation_id;

  if found then
    if v_event.request_fingerprint <> v_fingerprint
       or v_event.action <> 'SET_ROLE'
       or v_event.target_user_id <> p_user_id then
      raise exception using errcode = 'P0001', message = 'OPERATION_ID_CONFLICT';
    end if;

    return pg_catalog.jsonb_build_object(
      'result', case v_event.outcome
                  when 'APPLIED' then 'ROLE_CHANGED'
                  else 'ROLE_UNCHANGED'
                end,
      'outcome', v_event.outcome,
      'replayed', true,
      'operation_id', v_event.operation_id,
      'event_id', v_event.id,
      'user_id', v_event.target_user_id,
      'role', v_event.new_role,
      'deactivated_at', v_event.new_deactivated_at,
      'session_valid_after', v_event.new_session_valid_after
    );
  end if;

  -- 6. Lock the target.
  select p.*
    into v_profile
    from public.profiles as p
   where p.id = p_user_id
     for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'PROFILE_NOT_FOUND';
  end if;

  -- 7. Expected role first, even if the current role equals p_new_role.
  if v_profile.role <> p_expected_role then
    raise exception using errcode = 'P0001', message = 'STATE_CONFLICT';
  end if;

  -- 8. NOOP: already the requested role; no UPDATE, updated_at unchanged.
  if v_profile.role = p_new_role then
    insert into app_private.account_lifecycle_events (
      operation_id, request_fingerprint, action, outcome, target_user_id,
      actor, reason,
      old_role, new_role,
      old_deactivated_at, new_deactivated_at,
      old_session_valid_after, new_session_valid_after
    )
    values (
      p_operation_id, v_fingerprint, 'SET_ROLE', 'NOOP', p_user_id,
      v_actor, v_reason,
      v_profile.role, v_profile.role,
      v_profile.deactivated_at, v_profile.deactivated_at,
      v_profile.session_valid_after, v_profile.session_valid_after
    )
    returning id into v_event_id;

    return pg_catalog.jsonb_build_object(
      'result', 'ROLE_UNCHANGED',
      'outcome', 'NOOP',
      'replayed', false,
      'operation_id', p_operation_id,
      'event_id', v_event_id,
      'user_id', p_user_id,
      'role', v_profile.role,
      'deactivated_at', v_profile.deactivated_at,
      'session_valid_after', v_profile.session_valid_after
    );
  end if;

  -- 9. Last active OWNER: only a demotion of an active OWNER lowers the
  -- count. Lock every active OWNER in id order, then count the others.
  if v_profile.role = 'OWNER' and v_profile.deactivated_at is null then
    perform 1
       from public.profiles as p
      where p.role = 'OWNER'
        and p.deactivated_at is null
      order by p.id
        for update;

    select pg_catalog.count(*)
      into v_other_active_owners
      from public.profiles as p
     where p.role = 'OWNER'
       and p.deactivated_at is null
       and p.id <> p_user_id;

    if v_other_active_owners = 0 then
      raise exception using errcode = 'P0001', message = 'LAST_ACTIVE_OWNER';
    end if;
  end if;

  -- 10. Profile and event, same transaction.
  update public.profiles as p
     set role = p_new_role
   where p.id = p_user_id
  returning p.* into v_updated;

  insert into app_private.account_lifecycle_events (
    operation_id, request_fingerprint, action, outcome, target_user_id,
    actor, reason,
    old_role, new_role,
    old_deactivated_at, new_deactivated_at,
    old_session_valid_after, new_session_valid_after
  )
  values (
    p_operation_id, v_fingerprint, 'SET_ROLE', 'APPLIED', p_user_id,
    v_actor, v_reason,
    v_profile.role, v_updated.role,
    v_profile.deactivated_at, v_updated.deactivated_at,
    v_profile.session_valid_after, v_updated.session_valid_after
  )
  returning id into v_event_id;

  return pg_catalog.jsonb_build_object(
    'result', 'ROLE_CHANGED',
    'outcome', 'APPLIED',
    'replayed', false,
    'operation_id', p_operation_id,
    'event_id', v_event_id,
    'user_id', p_user_id,
    'role', v_updated.role,
    'deactivated_at', v_updated.deactivated_at,
    'session_valid_after', v_updated.session_valid_after
  );
end;
$$;

revoke all on function app_private.admin_set_role(uuid, public.user_role, public.user_role, text, text, uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Final check (DATABASE-DESIGN §14.2 step 1a)
--
-- Aborts the whole migration if it did not run as postgres, if any admin
-- function is not the expected SECURITY INVOKER / empty search_path /
-- postgres-owned function, if PUBLIC or an API role can execute one, if an
-- API role or PUBLIC holds any privilege on the event table or its
-- sequence, or if RLS or the append-only triggers are missing.
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn regprocedure;
  v_role text;
  v_admin_count integer;
begin
  if current_user <> 'postgres' then
    raise exception 'account_lifecycle_admin check failed: current_user is not postgres';
  end if;

  select pg_catalog.count(*)
    into v_admin_count
    from pg_catalog.pg_proc as p
   where p.pronamespace = 'app_private'::regnamespace
     and p.proname like 'admin\_%';

  if v_admin_count <> 6 then
    raise exception 'account_lifecycle_admin check failed: expected 6 admin functions';
  end if;

  foreach v_fn in array array[
    'app_private.admin_assert_trusted_context()',
    'app_private.admin_get_account_state(uuid, uuid)',
    'app_private.admin_provision_profile(uuid, text, text, public.user_role, text, text, uuid)',
    'app_private.admin_deactivate_account(uuid, timestamptz, text, text, uuid)',
    'app_private.admin_reactivate_account(uuid, timestamptz, text, text, uuid)',
    'app_private.admin_set_role(uuid, public.user_role, public.user_role, text, text, uuid)',
    'app_private.account_lifecycle_events_reject_change()'
  ]::regprocedure[]
  loop
    if not exists (
      select 1
        from pg_catalog.pg_proc as p
       where p.oid = v_fn
         and p.proowner = 'postgres'::regrole
         and not p.prosecdef
         and 'search_path=""' = any (p.proconfig)
    ) then
      raise exception 'account_lifecycle_admin check failed: % definition', v_fn;
    end if;

    if exists (
      select 1
        from pg_catalog.pg_proc as p,
             pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) as a
       where p.oid = v_fn
         and a.grantee <> p.proowner
    ) then
      raise exception 'account_lifecycle_admin check failed: % has non-owner EXECUTE', v_fn;
    end if;

    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
      if pg_catalog.has_function_privilege(v_role, v_fn, 'EXECUTE') then
        raise exception 'account_lifecycle_admin check failed: % executable by %', v_fn, v_role;
      end if;
    end loop;
  end loop;

  foreach v_fn in array array[
    'app_private.admin_provision_profile(uuid, text, text, public.user_role, text, text, uuid)',
    'app_private.admin_deactivate_account(uuid, timestamptz, text, text, uuid)',
    'app_private.admin_reactivate_account(uuid, timestamptz, text, text, uuid)',
    'app_private.admin_set_role(uuid, public.user_role, public.user_role, text, text, uuid)'
  ]::regprocedure[]
  loop
    if not exists (
      select 1
        from pg_catalog.pg_proc as p
       where p.oid = v_fn
         and 'lock_timeout=5s' = any (p.proconfig)
    ) then
      raise exception 'account_lifecycle_admin check failed: % lock_timeout', v_fn;
    end if;
  end loop;

  -- A NULL relacl means owner-only for tables and sequences, so aclexplode
  -- of the stored ACL is enough here.
  if exists (
    select 1
      from pg_catalog.pg_class as c,
           pg_catalog.aclexplode(c.relacl) as a
     where c.oid in (
             'app_private.account_lifecycle_events'::regclass,
             'app_private.account_lifecycle_events_id_seq'::regclass)
       and a.grantee <> c.relowner
  ) then
    raise exception 'account_lifecycle_admin check failed: event table or sequence has non-owner privileges';
  end if;

  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if pg_catalog.has_table_privilege(v_role, 'app_private.account_lifecycle_events',
         'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
       or pg_catalog.has_any_column_privilege(v_role, 'app_private.account_lifecycle_events',
         'SELECT, INSERT, UPDATE, REFERENCES')
       or pg_catalog.has_sequence_privilege(v_role, 'app_private.account_lifecycle_events_id_seq',
         'USAGE, SELECT, UPDATE') then
      raise exception 'account_lifecycle_admin check failed: event table reachable by %', v_role;
    end if;
  end loop;

  if not exists (
    select 1
      from pg_catalog.pg_class as c
     where c.oid = 'app_private.account_lifecycle_events'::regclass
       and c.relrowsecurity
  ) or exists (
    select 1
      from pg_catalog.pg_policy as pol
     where pol.polrelid = 'app_private.account_lifecycle_events'::regclass
  ) then
    raise exception 'account_lifecycle_admin check failed: event table RLS';
  end if;

  if (
    select pg_catalog.count(*)
      from pg_catalog.pg_trigger as t
     where t.tgrelid = 'app_private.account_lifecycle_events'::regclass
       and t.tgname in ('account_lifecycle_events_no_update_delete',
                        'account_lifecycle_events_no_truncate')
       and t.tgenabled = 'A'
  ) <> 2 then
    raise exception 'account_lifecycle_admin check failed: append-only triggers';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_class as c
     where c.oid = 'public.profiles'::regclass
       and c.relrowsecurity
  ) then
    raise exception 'account_lifecycle_admin check failed: profiles RLS';
  end if;
end;
$$;
