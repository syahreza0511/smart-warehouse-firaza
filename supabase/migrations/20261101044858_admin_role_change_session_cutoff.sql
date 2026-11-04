-- ===========================================================================
-- Smart Warehouse Firaza — admin role change advances the session cutoff
--
-- STACK-DECISION-LOG ADR-14 G1 (Option B, approved 1 November 2026);
-- DATABASE-DESIGN §12.5.6 "Perubahan role".
--
-- Additive: replaces only app_private.admin_set_role with the same signature,
-- owner, privileges, SECURITY INVOKER, search_path, and lock_timeout. CREATE OR
-- REPLACE keeps the existing ACL (EXECUTE for postgres only). The three earlier
-- migrations are not modified.
--
-- Change: an APPLIED role change also sets session_valid_after =
-- clock_timestamp(), so every Auth session created before the change is
-- rejected by app_private.current_app_role() and the user must sign in again.
-- Unchanged: trusted-context check, validation, the firaza.admin_lifecycle.v1
-- fingerprint, advisory lock, operation_id replay (historical result, no
-- event, no cutoff change), target row lock, expected role before NOOP, NOOP
-- without UPDATE, last active OWNER guard, one event per operation, error
-- codes, and the returned jsonb contract.
-- ===========================================================================

create or replace function app_private.admin_set_role(
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

  -- 10. Role and a new session cutoff in one UPDATE (G1), plus the event,
  -- same transaction. Sessions created before the cutoff lose application
  -- authorization; the event records the old and new cutoff.
  update public.profiles as p
     set role = p_new_role,
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

-- ---------------------------------------------------------------------------
-- Final check
--
-- Aborts the migration if it did not run as postgres, or if admin_set_role is
-- not the postgres-owned SECURITY INVOKER function with empty search_path and
-- lock_timeout 5s, or if any role other than the owner can execute it.
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn constant regprocedure :=
    'app_private.admin_set_role(uuid, public.user_role, public.user_role, text, text, uuid)';
  v_role text;
begin
  if current_user <> 'postgres' then
    raise exception 'admin_role_change_session_cutoff check failed: current_user is not postgres';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_proc as p
     where p.oid = v_fn
       and p.proowner = 'postgres'::regrole
       and not p.prosecdef
       and 'search_path=""' = any (p.proconfig)
       and 'lock_timeout=5s' = any (p.proconfig)
  ) then
    raise exception 'admin_role_change_session_cutoff check failed: definition';
  end if;

  if exists (
    select 1
      from pg_catalog.pg_proc as p,
           pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) as a
     where p.oid = v_fn
       and a.grantee <> p.proowner
  ) then
    raise exception 'admin_role_change_session_cutoff check failed: non-owner EXECUTE';
  end if;

  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if pg_catalog.has_function_privilege(v_role, v_fn, 'EXECUTE') then
      raise exception 'admin_role_change_session_cutoff check failed: executable by %', v_role;
    end if;
  end loop;
end;
$$;
