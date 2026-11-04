-- Stock Out boundary test (7SUP.5B-2B, test matrix #2): a Stock Out equal to
-- the whole balance brings it to exactly 0, and one more unit is rejected
-- with INSUFFICIENT_STOCK. Nothing is kept.
--
-- Local Supabase only, and only with owner approval. Run as postgres through
-- the local database container. Two modes, so the test can identify the
-- session it uses without anyone passing or printing a session id:
--
--   1. Snapshot (read only), BEFORE logging in:
--        docker exec -i <local supabase_db container> psql -U postgres -d postgres \
--          -v allow=7SUP.5B-2B -v mode=snapshot -v staff_id=<STAFF_WAREHOUSE user uuid> \
--          < tests/integration/sql/stock-out-boundary.sql
--      Prints login_after (database clock) and sessions_before (an md5
--      fingerprint of that user's existing sessions; no ids).
--
--   2. Log in ONCE as that staff user (one new session).
--
--   3. Test:
--        docker exec -i <local supabase_db container> psql -U postgres -d postgres \
--          -v allow=7SUP.5B-2B -v mode=test -v staff_id=<same uuid> \
--          -v material_id=<[DEMO] material uuid with stock 1..10> \
--          -v login_after=<from step 1> -v sessions_before=<from step 1> \
--          < tests/integration/sql/stock-out-boundary.sql
--        echo $?   # 0 only if every check passed
--      The script itself selects the session: it must be the ONLY session of
--      that user created after login_after, and the fingerprint of all the
--      user's other sessions must still equal sessions_before. So no session
--      that existed before step 1 (including any residual session) can be
--      used, and an extra or vanished session aborts the test.
--
--   4. Log out that session.
--
-- Safety layers for the mutation:
--   1. It runs inside a PL/pgSQL BEGIN ... EXCEPTION block that always ends
--      by raising a sentinel. A PL/pgSQL exception block is a subtransaction;
--      when it is left through an error, PostgreSQL rolls back the data
--      changes made inside it, and setting changes made inside it (SET LOCAL
--      ROLE, set_config(..., true)) are reverted as for a rolled-back
--      savepoint. Variables keep their values, which is how the results are
--      read afterwards. The block checks at run time that the role and the
--      claims really were restored; if not, the test fails.
--   2. An explicit BEGIN ... ROLLBACK around it.
--   3. Target limited to an active, unfrozen [DEMO] material with stock 1..10.
--   4. Every abort is an SQL error, so psql exits non-zero (ON_ERROR_STOP).
-- Layer 1 relies on documented PostgreSQL behaviour that this repository has
-- not yet exercised; the run-time checks and the final state comparison are
-- what prove it in a given run.
--
-- The session id is never printed. No credentials are needed or stored here.

\set ON_ERROR_STOP on

\if :{?allow}
\else
  \echo 'ABORT: pass -v allow=7SUP.5B-2B to confirm owner approval.'
  select 1 / 0 as abort_missing_allow;
\endif

\if :{?mode}
\else
  \echo 'ABORT: missing -v mode=snapshot|test'
  select 1 / 0 as abort_missing_mode;
\endif

\if :{?staff_id}
\else
  \echo 'ABORT: missing -v staff_id'
  select 1 / 0 as abort_missing_staff_id;
\endif

\o /dev/null
select
  set_config('firaza.test_allow', :'allow', false),
  set_config('firaza.test_staff', :'staff_id', false);
\o

select (:'mode' = 'snapshot') as mode_snapshot, (:'mode' = 'test') as mode_test \gset

\if :mode_snapshot
\elif :mode_test
\else
  \echo 'ABORT: mode must be snapshot or test'
  select 1 / 0 as abort_bad_mode;
\endif

-- Guards common to both modes (run as postgres, read only).
do $$
declare
  v_staff uuid := current_setting('firaza.test_staff')::uuid;
begin
  if current_setting('firaza.test_allow') <> '7SUP.5B-2B' then
    raise exception 'ABORT: wrong approval token';
  end if;
  if not exists (
    select 1 from public.profiles p
     where p.id = v_staff and p.role = 'STAFF_WAREHOUSE' and p.deactivated_at is null
  ) then
    raise exception 'ABORT: staff_id is not an active STAFF_WAREHOUSE profile';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Mode snapshot: read only, prints a reference time and a fingerprint.
-- ---------------------------------------------------------------------------
\if :mode_snapshot
begin transaction read only;
select
  'login_after=' || pg_catalog.clock_timestamp()::text as login_after,
  'sessions_before=' || md5(coalesce(string_agg(
      s.id::text || '/' || s.created_at::text || '/' || coalesce(s.updated_at::text, '') || '/' ||
      coalesce(s.refreshed_at::text, '') || '/' || coalesce(s.not_after::text, '') || '/' ||
      coalesce(s.refresh_token_counter::text, ''),
      ',' order by s.id), '')) as sessions_before,
  'existing_sessions=' || count(*) as existing_sessions
  from auth.sessions s
 where s.user_id = current_setting('firaza.test_staff')::uuid;
rollback;
\echo 'Snapshot taken. Log in once as this staff user, then run mode=test with these values.'
\endif

-- ---------------------------------------------------------------------------
-- Mode test.
-- ---------------------------------------------------------------------------
\if :mode_test

\if :{?material_id}
\else
  \echo 'ABORT: missing -v material_id'
  select 1 / 0 as abort_missing_material_id;
\endif
\if :{?login_after}
\else
  \echo 'ABORT: missing -v login_after (from mode=snapshot)'
  select 1 / 0 as abort_missing_login_after;
\endif
\if :{?sessions_before}
\else
  \echo 'ABORT: missing -v sessions_before (from mode=snapshot)'
  select 1 / 0 as abort_missing_sessions_before;
\endif

\o /dev/null
select
  set_config('firaza.test_material', :'material_id', false),
  set_config('firaza.test_login_after', :'login_after', false),
  set_config('firaza.test_sessions_before', :'sessions_before', false);
\o

-- Target and session guards. The selected session id is stored as a session
-- setting for the test block and never printed.
do $$
declare
  v_material uuid := current_setting('firaza.test_material')::uuid;
  v_staff uuid := current_setting('firaza.test_staff')::uuid;
  v_login_after timestamptz := current_setting('firaza.test_login_after')::timestamptz;
  v_stock integer;
  v_new_count integer;
  v_session uuid;
  v_others text;
begin
  select current_stock into v_stock
    from public.materials
   where id = v_material and name like '[DEMO]%' and archived_at is null and active_opname_id is null;
  if v_stock is null then
    raise exception 'ABORT: target must be an active, unfrozen [DEMO] material';
  end if;
  if v_stock not between 1 and 10 then
    raise exception 'ABORT: target stock must be 1..10 (got %)', v_stock;
  end if;

  if v_login_after > clock_timestamp() or v_login_after < clock_timestamp() - interval '30 minutes' then
    raise exception 'ABORT: login_after must come from a snapshot taken in the last 30 minutes';
  end if;

  select count(*) into v_new_count
    from auth.sessions s
   where s.user_id = v_staff and s.created_at > v_login_after;
  if v_new_count <> 1 then
    raise exception 'ABORT: expected exactly one session of staff_id created after the snapshot, found %', v_new_count;
  end if;

  select s.id into v_session
    from auth.sessions s
   where s.user_id = v_staff and s.created_at > v_login_after
     and (s.not_after is null or s.not_after > now());
  if v_session is null then
    raise exception 'ABORT: the new session is not live';
  end if;

  select md5(coalesce(string_agg(
      s.id::text || '/' || s.created_at::text || '/' || coalesce(s.updated_at::text, '') || '/' ||
      coalesce(s.refreshed_at::text, '') || '/' || coalesce(s.not_after::text, '') || '/' ||
      coalesce(s.refresh_token_counter::text, ''),
      ',' order by s.id), ''))
    into v_others
    from auth.sessions s
   where s.user_id = v_staff and s.id <> v_session;
  if v_others <> current_setting('firaza.test_sessions_before') then
    raise exception 'ABORT: the user''s pre-existing sessions changed since the snapshot';
  end if;

  perform set_config('firaza.test_session', v_session::text, false);
end;
$$;

-- State before the test.
\o /dev/null
select set_config(
  'firaza.test_before',
  pg_catalog.concat_ws('|',
    (select count(*) from public.inventory_transactions),
    (select md5(coalesce(string_agg(t::text, ',' order by t.id), '')) from public.inventory_transactions t),
    (select count(*) from app_private.idempotency_requests),
    (select string_agg(m.id::text || '=' || m.current_stock, ',' order by m.id) from public.materials m)),
  false);
\o

begin;

do $$
declare
  v_material uuid := current_setting('firaza.test_material')::uuid;
  v_stock integer;
  v_result jsonb;
  v_second_error text;
  v_inner_user text;
  v_sentinel constant text := 'FIRAZA_TEST_ROLLBACK_SENTINEL';
begin
  -- Layer 1: everything that changes data or settings happens in this block
  -- and is undone by the sentinel at its end.
  begin
    set local role authenticated;
    perform set_config(
      'request.jwt.claims',
      pg_catalog.json_build_object(
        'sub', current_setting('firaza.test_staff'),
        'role', 'authenticated',
        'session_id', current_setting('firaza.test_session'))::text,
      true);
    v_inner_user := current_user;

    select current_stock into v_stock from public.materials where id = v_material;
    if v_stock is null then
      raise exception 'FAIL SQL-00: material not visible to the session (claims or session invalid)';
    end if;

    v_result := public.post_stock_movement(
      v_material, 'STOCK_OUT', v_stock, 'TEST 7SUP.5B-2B SQL ROLLBACK boundary', gen_random_uuid()::text);

    begin
      perform public.post_stock_movement(v_material, 'STOCK_OUT', 1, null, gen_random_uuid()::text);
      v_second_error := 'ACCEPTED';
    exception
      when others then
        v_second_error := sqlerrm;
    end;

    raise exception using message = v_sentinel;
  exception
    when others then
      if sqlerrm <> v_sentinel then
        raise;
      end if;
  end;

  -- Run-time proof that layer 1 restored role and claims.
  if v_inner_user is distinct from 'authenticated' then
    raise exception 'FAIL SQL-00: the test did not run as authenticated (ran as %)', v_inner_user;
  end if;
  if current_user <> 'postgres' then
    raise exception 'FAIL SQL-00: role was not restored after the sentinel rollback';
  end if;
  if coalesce(current_setting('request.jwt.claims', true), '') <> '' then
    raise exception 'FAIL SQL-00: claims were not cleared after the sentinel rollback';
  end if;

  -- Assertions on values captured before the rollback of layer 1.
  if (v_result ->> 'current_stock')::integer <> 0 or (v_result ->> 'quantity_delta')::integer <> -v_stock then
    raise exception 'FAIL SQL-01: expected stock 0 and delta %, got %', -v_stock, v_result;
  end if;
  raise notice 'PASS SQL-01 | Stock Out equal to the balance (%) -> 0', v_stock;

  if v_second_error is distinct from 'INSUFFICIENT_STOCK' then
    raise exception 'FAIL SQL-02: one more unit gave %', v_second_error;
  end if;
  raise notice 'PASS SQL-02 | one more unit -> INSUFFICIENT_STOCK';
end;
$$;

-- Layer 2.
rollback;

-- Nothing may remain: all transactions (count and checksum), idempotency
-- rows, and every material balance.
do $$
declare
  v_after text;
begin
  v_after := pg_catalog.concat_ws('|',
    (select count(*) from public.inventory_transactions),
    (select md5(coalesce(string_agg(t::text, ',' order by t.id), '')) from public.inventory_transactions t),
    (select count(*) from app_private.idempotency_requests),
    (select string_agg(m.id::text || '=' || m.current_stock, ',' order by m.id) from public.materials m));
  if v_after <> current_setting('firaza.test_before') then
    raise exception 'FAIL SQL-03: state changed after the test';
  end if;
  raise notice 'PASS SQL-03 | transactions, checksum, idempotency rows, and all balances unchanged';
end;
$$;

\endif
