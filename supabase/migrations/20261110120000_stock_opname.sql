-- Stock Opname RPCs: create a session with its materials, record counts,
-- post, and cancel (PRD FR-OPN-01 to FR-OPN-17; DATABASE-DESIGN §4.6, §4.7,
-- §9.1, §11, §13; STACK-DECISION-LOG ADR-08, ADR-09, ADR-13, ADR-15 B5.3).
--
-- Additive: no table, column, constraint, index, policy, grant, or earlier
-- function changes. The tables stock_opname and stock_opname_items, the
-- opname_status enum, materials.active_opname_id, and the ADJUSTMENT rules on
-- inventory_transactions come from migration 20261101064015 and are used as
-- they are.
--
-- Owner decisions applied (B4-S1, 10 November 2026):
--   * OD-01: materials are chosen when the session is created; there is no
--     function that adds an item later or removes one. (This narrows PRD
--     FR-OPN-03, which allowed adding materials while a session is active.)
--   * OD-02 / OD-16: only the STAFF_WAREHOUSE who created the session may
--     record counts and post it. Any STAFF_WAREHOUSE may cancel an active
--     session, with a reason (FR-OPN-14). OWNER writes nothing.
--   * OD-05: archive_material already rejects a frozen material
--     (MATERIAL_FROZEN, migration 20261110090000); post_stock_movement
--     already rejects Stock In/Out on one (migration 20261101064015).
--
-- PROVISIONAL, pending explicit Owner approval:
--   * OD-20 (create duplicates) is still an open decision (DATABASE-DESIGN
--     §9.1). This file provisionally gives create_stock_opname the existing
--     idempotency_requests contract (operation 'create_stock_opname'), so a
--     resent create replays the first result instead of opening a second
--     session. No schema change is needed: (user_id, key) is unique across
--     operations and the operation name is part of request_hash (§9.2). If
--     the Owner decides otherwise, a later migration changes this function.
--
-- Duplicate protection for the other operations (§9.1, OD-12): post and
-- cancel are rejected with OPNAME_NOT_ACTIVE once the session is no longer
-- ACTIVE (a rejection, not a replay); record counts overwrites the same
-- values (SET semantics). ADJUSTMENT rows are additionally unique per item
-- (inventory_transactions_stock_opname_item_id_key).
--
-- Lock order (§13.3), the same in every function that touches a session:
--   1. the stock_opname row (FOR UPDATE);
--   2. the material rows of the session's items, ascending by materials.id.
-- create_stock_opname has no session row yet and locks only step 2. Every
-- other function in the schema locks at most one material row and never a
-- session row, so no function waits on a session while holding a material.
--
-- Errors: 42501 UNAUTHORIZED / FORBIDDEN from require_staff_warehouse();
-- P0001 with the business code as the message, no DETAIL or HINT.
--
-- Do not add explicit transaction control or batch-splitting statements to
-- this file (DATABASE-DESIGN §14.1).

-- ---------------------------------------------------------------------------
-- create_stock_opname (§11.3 add_stock_opname_item, merged into create by
-- OD-01; FR-OPN-01, FR-OPN-03, FR-OPN-04, FR-OPN-05)
--
-- Order: caller and role; input; idempotency row (a concurrent request with
-- the same key waits on the primary key, then replays or is rejected);
-- material locks ascending by id; state checks; session, items, and freeze
-- in one transaction. current_stock is never written here.
-- ---------------------------------------------------------------------------
create function app_private.create_stock_opname(
  p_material_ids uuid[],
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_operation constant text := 'create_stock_opname';
  v_user_id uuid;
  v_ids uuid[];
  v_hash text;
  v_inserted boolean;
  v_existing app_private.idempotency_requests%rowtype;
  v_material record;
  v_locked integer := 0;
  v_opname public.stock_opname%rowtype;
  v_item_count integer;
  v_response jsonb;
begin
  -- 1. Identity and role, before any replay can be returned (§9.3).
  v_user_id := app_private.require_staff_warehouse();

  -- 2. Input.
  if p_material_ids is null or pg_catalog.cardinality(p_material_ids) = 0 then
    raise exception using errcode = 'P0001', message = 'OPNAME_MATERIALS_REQUIRED';
  end if;

  -- One dimension only. A uuid[] parameter also accepts '{{a,b},{c,d}}',
  -- which array_position would reject with an error instead of a code.
  if pg_catalog.array_ndims(p_material_ids) is distinct from 1 then
    raise exception using errcode = 'P0001', message = 'INVALID_MATERIAL_LIST';
  end if;

  if pg_catalog.cardinality(p_material_ids) > 200 then
    raise exception using errcode = 'P0001', message = 'OPNAME_TOO_MANY_MATERIALS';
  end if;

  if pg_catalog.array_position(p_material_ids, null) is not null then
    raise exception using errcode = 'P0001', message = 'MATERIAL_NOT_FOUND';
  end if;

  select pg_catalog.array_agg(distinct x.id order by x.id)
    into v_ids
    from pg_catalog.unnest(p_material_ids) as x(id);

  if pg_catalog.cardinality(v_ids) <> pg_catalog.cardinality(p_material_ids) then
    raise exception using errcode = 'P0001', message = 'DUPLICATE_MATERIAL';
  end if;

  if p_idempotency_key is null or pg_catalog.btrim(p_idempotency_key) = '' then
    raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_KEY_REQUIRED';
  end if;

  if pg_catalog.char_length(p_idempotency_key) > 200 then
    raise exception using errcode = 'P0001', message = 'INVALID_IDEMPOTENCY_KEY';
  end if;

  -- 3. Idempotency (§9.2, §9.3). The sorted id list makes the hash
  -- independent of the order the client sent.
  v_hash := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
      'v', 'firaza.opname.v1',
      'operation', v_operation,
      'material_ids', pg_catalog.to_jsonb(v_ids)
    )::text, 'UTF8')),
    'hex');

  insert into app_private.idempotency_requests (user_id, key, operation, request_hash)
  values (v_user_id, p_idempotency_key, v_operation, v_hash)
  on conflict (user_id, key) do nothing
  returning true into v_inserted;

  if v_inserted is null then
    select r.*
      into v_existing
      from app_private.idempotency_requests as r
     where r.user_id = v_user_id
       and r.key = p_idempotency_key;

    if not found then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_STATE_INVALID';
    end if;

    if v_existing.operation <> v_operation or v_existing.request_hash <> v_hash then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_KEY_REUSED';
    end if;

    if v_existing.response is null then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_STATE_INVALID';
    end if;

    return v_existing.response;
  end if;

  -- 4. Lock the materials ascending by id (§13.3) and check their state.
  -- The checks read the locked row, so a concurrent create for the same
  -- material waits here and then sees active_opname_id (§11.4).
  for v_material in
    select m.id, m.archived_at, m.active_opname_id
      from public.materials as m
     where m.id = any (v_ids)
     order by m.id
       for update
  loop
    v_locked := v_locked + 1;

    if v_material.archived_at is not null then
      raise exception using errcode = 'P0001', message = 'MATERIAL_ARCHIVED';
    end if;

    if v_material.active_opname_id is not null then
      raise exception using errcode = 'P0001', message = 'MATERIAL_ALREADY_IN_OPNAME';
    end if;
  end loop;

  if v_locked <> pg_catalog.cardinality(v_ids) then
    raise exception using errcode = 'P0001', message = 'MATERIAL_NOT_FOUND';
  end if;

  -- 5. Session, items with the stock snapshot, and the freeze, together.
  insert into public.stock_opname (status, created_by)
  values ('ACTIVE', v_user_id)
  returning * into v_opname;

  insert into public.stock_opname_items (stock_opname_id, material_id, system_stock, added_by)
  select v_opname.id, m.id, m.current_stock, v_user_id
    from public.materials as m
   where m.id = any (v_ids);

  get diagnostics v_item_count = row_count;

  update public.materials as m
     set active_opname_id = v_opname.id
   where m.id = any (v_ids);

  v_response := pg_catalog.jsonb_build_object(
    'opname_id', v_opname.id,
    'status', v_opname.status,
    'item_count', v_item_count,
    'created_at', v_opname.created_at
  );

  update app_private.idempotency_requests as r
     set response = v_response
   where r.user_id = v_user_id
     and r.key = p_idempotency_key;

  return v_response;
end;
$$;

-- ---------------------------------------------------------------------------
-- record_stock_opname_counts (§11.3 record_stock_opname_count, for several
-- items at once; FR-OPN-06, FR-OPN-07)
--
-- p_counts: a JSON array of {"item_id": "<uuid>", "counted_stock": <int>}.
-- SET semantics: the value replaces the previous count, with counted_by and
-- counted_at. No inventory transaction and no material change. The session
-- row lock serializes counting with post and cancel.
-- ---------------------------------------------------------------------------
create function app_private.record_stock_opname_counts(
  p_opname_id uuid,
  p_counts jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_user_id uuid;
  v_element jsonb;
  v_value numeric;
  v_opname public.stock_opname%rowtype;
  v_updated integer;
begin
  v_user_id := app_private.require_staff_warehouse();

  if p_opname_id is null then
    raise exception using errcode = 'P0001', message = 'OPNAME_NOT_FOUND';
  end if;

  -- Shape: a non-empty array of objects with a UUID item_id and a numeric
  -- counted_stock, no item twice. Each step only runs after the previous one
  -- confirmed the JSON type it relies on: PostgreSQL does not promise
  -- left-to-right evaluation of OR, and jsonb_array_length,
  -- jsonb_array_elements, and the casts below raise errors on the wrong type.
  if pg_catalog.jsonb_typeof(p_counts) is distinct from 'array' then
    raise exception using errcode = 'P0001', message = 'INVALID_COUNTS';
  end if;

  if pg_catalog.jsonb_array_length(p_counts) not between 1 and 500 then
    raise exception using errcode = 'P0001', message = 'INVALID_COUNTS';
  end if;

  for v_element in select e.value from pg_catalog.jsonb_array_elements(p_counts) as e loop
    if pg_catalog.jsonb_typeof(v_element) is distinct from 'object' then
      raise exception using errcode = 'P0001', message = 'INVALID_COUNTS';
    end if;

    if pg_catalog.jsonb_typeof(v_element -> 'item_id') is distinct from 'string'
       or pg_catalog.jsonb_typeof(v_element -> 'counted_stock') is distinct from 'number' then
      raise exception using errcode = 'P0001', message = 'INVALID_COUNTS';
    end if;

    -- Only canonical UUID text reaches the ::uuid casts below.
    if (v_element ->> 'item_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception using errcode = 'P0001', message = 'INVALID_COUNTS';
    end if;

    -- A JSON number always converts to numeric.
    v_value := (v_element ->> 'counted_stock')::numeric;

    if v_value <> pg_catalog.trunc(v_value) or v_value < 0 or v_value > 2147483647 then
      raise exception using errcode = 'P0001', message = 'INVALID_COUNTED_STOCK';
    end if;
  end loop;

  if (
    select pg_catalog.count(distinct (e.value ->> 'item_id')::uuid)
      from pg_catalog.jsonb_array_elements(p_counts) as e
  ) <> pg_catalog.jsonb_array_length(p_counts) then
    raise exception using errcode = 'P0001', message = 'INVALID_COUNTS';
  end if;

  -- Session lock, state, and creator (OD-02).
  select s.*
    into v_opname
    from public.stock_opname as s
   where s.id = p_opname_id
     for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'OPNAME_NOT_FOUND';
  end if;

  if v_opname.status <> 'ACTIVE' then
    raise exception using errcode = 'P0001', message = 'OPNAME_NOT_ACTIVE';
  end if;

  if v_opname.created_by <> v_user_id then
    raise exception using errcode = 'P0001', message = 'OPNAME_CREATOR_ONLY';
  end if;

  -- Every item must belong to this session.
  if exists (
    select 1
      from pg_catalog.jsonb_array_elements(p_counts) as e
     where not exists (
       select 1
         from public.stock_opname_items as i
        where i.id = (e.value ->> 'item_id')::uuid
          and i.stock_opname_id = p_opname_id
     )
  ) then
    raise exception using errcode = 'P0001', message = 'OPNAME_ITEM_NOT_FOUND';
  end if;

  update public.stock_opname_items as i
     set counted_stock = c.counted_stock,
         counted_by = v_user_id,
         counted_at = pg_catalog.now()
    from (
      select (e.value ->> 'item_id')::uuid as item_id,
             (e.value ->> 'counted_stock')::numeric::integer as counted_stock
        from pg_catalog.jsonb_array_elements(p_counts) as e
    ) as c
   where i.id = c.item_id
     and i.stock_opname_id = p_opname_id;

  get diagnostics v_updated = row_count;

  return pg_catalog.jsonb_build_object(
    'opname_id', p_opname_id,
    'updated', v_updated
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- post_stock_opname (§11.3; FR-OPN-08 to FR-OPN-13)
--
-- All or nothing: any error rolls back every ADJUSTMENT, stock change, and
-- freeze release, and the session stays ACTIVE (FR-OPN-10).
-- delta = counted_stock - current_stock, and current_stock must still equal
-- the system_stock snapshot (defensive: a frozen material cannot change).
-- A zero delta writes no transaction (FR-OPN-11).
-- ---------------------------------------------------------------------------
create function app_private.post_stock_opname(p_opname_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_user_id uuid;
  v_opname public.stock_opname%rowtype;
  v_item record;
  v_delta integer;
  v_transaction_id uuid;
  v_adjustments jsonb := '[]'::jsonb;
  v_item_count integer := 0;
  v_posted_at timestamptz;
begin
  v_user_id := app_private.require_staff_warehouse();

  if p_opname_id is null then
    raise exception using errcode = 'P0001', message = 'OPNAME_NOT_FOUND';
  end if;

  -- 1. Session lock, state, and creator (OD-16).
  select s.*
    into v_opname
    from public.stock_opname as s
   where s.id = p_opname_id
     for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'OPNAME_NOT_FOUND';
  end if;

  if v_opname.status <> 'ACTIVE' then
    raise exception using errcode = 'P0001', message = 'OPNAME_NOT_ACTIVE';
  end if;

  if v_opname.created_by <> v_user_id then
    raise exception using errcode = 'P0001', message = 'OPNAME_CREATOR_ONLY';
  end if;

  -- 2. Completeness (FR-OPN-08, FR-OPN-09).
  if not exists (
    select 1 from public.stock_opname_items as i where i.stock_opname_id = p_opname_id
  ) then
    raise exception using errcode = 'P0001', message = 'OPNAME_EMPTY';
  end if;

  if exists (
    select 1
      from public.stock_opname_items as i
     where i.stock_opname_id = p_opname_id
       and i.counted_stock is null
  ) then
    raise exception using errcode = 'P0001', message = 'OPNAME_UNCOUNTED';
  end if;

  -- 3. Lock the session's materials ascending by id (§13.3).
  perform 1
     from public.materials as m
    where m.id in (
      select i.material_id from public.stock_opname_items as i where i.stock_opname_id = p_opname_id
    )
    order by m.id
      for update;

  -- 4. No material outside the items may point at this session (§11.1).
  if exists (
    select 1
      from public.materials as m
     where m.active_opname_id = p_opname_id
       and not exists (
         select 1
           from public.stock_opname_items as i
          where i.stock_opname_id = p_opname_id
            and i.material_id = m.id
       )
  ) then
    raise exception using errcode = 'P0001', message = 'OPNAME_INVARIANT_VIOLATION';
  end if;

  -- 5. Per item, in the same order.
  for v_item in
    select i.id as item_id,
           i.material_id,
           i.system_stock,
           i.counted_stock,
           m.current_stock,
           m.active_opname_id,
           m.archived_at
      from public.stock_opname_items as i
      join public.materials as m on m.id = i.material_id
     where i.stock_opname_id = p_opname_id
     order by m.id
  loop
    v_item_count := v_item_count + 1;

    if v_item.active_opname_id is distinct from p_opname_id
       or v_item.archived_at is not null
       or v_item.current_stock <> v_item.system_stock then
      raise exception using errcode = 'P0001', message = 'OPNAME_INVARIANT_VIOLATION';
    end if;

    -- Both values are 0..2147483647, so the difference fits in integer.
    v_delta := v_item.counted_stock - v_item.current_stock;

    if v_delta <> 0 then
      insert into public.inventory_transactions (
        material_id, type, quantity_delta, stock_opname_id, stock_opname_item_id, created_by
      )
      values (
        v_item.material_id, 'ADJUSTMENT', v_delta, p_opname_id, v_item.item_id, v_user_id
      )
      returning id into v_transaction_id;

      v_adjustments := v_adjustments || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'item_id', v_item.item_id,
        'material_id', v_item.material_id,
        'quantity_delta', v_delta,
        'transaction_id', v_transaction_id
      ));
    end if;

    update public.materials as m
       set current_stock = v_item.counted_stock,
           active_opname_id = null
     where m.id = v_item.material_id;
  end loop;

  -- 6. Terminal status.
  update public.stock_opname as s
     set status = 'POSTED',
         posted_by = v_user_id,
         posted_at = pg_catalog.now()
   where s.id = p_opname_id
  returning s.posted_at into v_posted_at;

  return pg_catalog.jsonb_build_object(
    'opname_id', p_opname_id,
    'status', 'POSTED',
    'posted_at', v_posted_at,
    'item_count', v_item_count,
    'adjustments', v_adjustments
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- cancel_stock_opname (§11.3; FR-OPN-14, FR-OPN-15)
--
-- Any STAFF_WAREHOUSE, reason required. Materials are found through the
-- session's items, locked ascending by id, checked against the freeze
-- invariant, and released together with the CANCELLED status. No stock
-- change and no transaction.
-- ---------------------------------------------------------------------------
create function app_private.cancel_stock_opname(p_opname_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_user_id uuid;
  v_opname public.stock_opname%rowtype;
  v_released integer;
  v_cancelled_at timestamptz;
begin
  v_user_id := app_private.require_staff_warehouse();

  perform app_private.require_status_reason(p_reason);

  if p_opname_id is null then
    raise exception using errcode = 'P0001', message = 'OPNAME_NOT_FOUND';
  end if;

  select s.*
    into v_opname
    from public.stock_opname as s
   where s.id = p_opname_id
     for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'OPNAME_NOT_FOUND';
  end if;

  if v_opname.status <> 'ACTIVE' then
    raise exception using errcode = 'P0001', message = 'OPNAME_NOT_ACTIVE';
  end if;

  perform 1
     from public.materials as m
    where m.id in (
      select i.material_id from public.stock_opname_items as i where i.stock_opname_id = p_opname_id
    )
    order by m.id
      for update;

  -- Freeze invariant in both directions (§11.1).
  if exists (
    select 1
      from public.stock_opname_items as i
      join public.materials as m on m.id = i.material_id
     where i.stock_opname_id = p_opname_id
       and m.active_opname_id is distinct from p_opname_id
  ) or exists (
    select 1
      from public.materials as m
     where m.active_opname_id = p_opname_id
       and not exists (
         select 1
           from public.stock_opname_items as i
          where i.stock_opname_id = p_opname_id
            and i.material_id = m.id
       )
  ) then
    raise exception using errcode = 'P0001', message = 'OPNAME_INVARIANT_VIOLATION';
  end if;

  update public.materials as m
     set active_opname_id = null
   where m.active_opname_id = p_opname_id;

  get diagnostics v_released = row_count;

  update public.stock_opname as s
     set status = 'CANCELLED',
         cancelled_by = v_user_id,
         cancelled_at = pg_catalog.now(),
         cancel_reason = p_reason
   where s.id = p_opname_id
  returning s.cancelled_at into v_cancelled_at;

  return pg_catalog.jsonb_build_object(
    'opname_id', p_opname_id,
    'status', 'CANCELLED',
    'cancelled_at', v_cancelled_at,
    'released', v_released
  );
end;
$$;

-- The wrappers run with the caller's privileges, so authenticated needs
-- EXECUTE on each implementation (ADR-13 D8). Calling an implementation
-- directly from SQL gets the same checks. app_private is not in the Data API
-- schemas, so these are reachable from the API only through the wrappers.
revoke all on function
  app_private.create_stock_opname(uuid[], text),
  app_private.record_stock_opname_counts(uuid, jsonb),
  app_private.post_stock_opname(uuid),
  app_private.cancel_stock_opname(uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function
  app_private.create_stock_opname(uuid[], text),
  app_private.record_stock_opname_counts(uuid, jsonb),
  app_private.post_stock_opname(uuid),
  app_private.cancel_stock_opname(uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Public RPC wrappers (ADR-09; §12.3). No logic of their own.
-- ---------------------------------------------------------------------------
create function public.create_stock_opname(p_material_ids uuid[], p_idempotency_key text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.create_stock_opname(p_material_ids, p_idempotency_key);
$$;

create function public.record_stock_opname_counts(p_opname_id uuid, p_counts jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.record_stock_opname_counts(p_opname_id, p_counts);
$$;

create function public.post_stock_opname(p_opname_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.post_stock_opname(p_opname_id);
$$;

create function public.cancel_stock_opname(p_opname_id uuid, p_reason text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.cancel_stock_opname(p_opname_id, p_reason);
$$;

revoke all on function
  public.create_stock_opname(uuid[], text),
  public.record_stock_opname_counts(uuid, jsonb),
  public.post_stock_opname(uuid),
  public.cancel_stock_opname(uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function
  public.create_stock_opname(uuid[], text),
  public.record_stock_opname_counts(uuid, jsonb),
  public.post_stock_opname(uuid),
  public.cancel_stock_opname(uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Final check (DATABASE-DESIGN §14.2; ADR-13 D3, D4, D8; ADR-15 B5.3)
--
-- Aborts the whole migration if it did not run as postgres, if a function
-- has an unexpected definition or EXECUTE grant, if the helpers it relies on
-- changed or became reachable, if the set of callable public functions is
-- not exactly the ten wrappers, if any API role gained a privilege on the
-- inventory tables beyond authenticated SELECT, or if the per-item ADJUSTMENT
-- unique index is missing.
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn regprocedure;
  v_rel regclass;
  v_role text;
  v_impls regprocedure[] := array[
    'app_private.create_stock_opname(uuid[], text)',
    'app_private.record_stock_opname_counts(uuid, jsonb)',
    'app_private.post_stock_opname(uuid)',
    'app_private.cancel_stock_opname(uuid, text)'
  ]::regprocedure[];
  v_wrappers regprocedure[] := array[
    'public.create_stock_opname(uuid[], text)',
    'public.record_stock_opname_counts(uuid, jsonb)',
    'public.post_stock_opname(uuid)',
    'public.cancel_stock_opname(uuid, text)'
  ]::regprocedure[];
begin
  if current_user <> 'postgres' then
    raise exception 'stock_opname check failed: current_user is not postgres';
  end if;

  foreach v_fn in array v_impls loop
    if not exists (
      select 1
        from pg_catalog.pg_proc as p
       where p.oid = v_fn
         and p.proowner = 'postgres'::regrole
         and p.prosecdef
         and 'search_path=""' = any (p.proconfig)
         and 'lock_timeout=5s' = any (p.proconfig)
    ) then
      raise exception 'stock_opname check failed: % definition', v_fn;
    end if;
  end loop;

  foreach v_fn in array v_wrappers loop
    if not exists (
      select 1
        from pg_catalog.pg_proc as p
       where p.oid = v_fn
         and p.proowner = 'postgres'::regrole
         and not p.prosecdef
         and 'search_path=""' = any (p.proconfig)
    ) then
      raise exception 'stock_opname check failed: % definition', v_fn;
    end if;
  end loop;

  foreach v_fn in array v_impls || v_wrappers loop
    if exists (
      select 1
        from pg_catalog.pg_proc as p,
             pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) as a
       where p.oid = v_fn
         and a.grantee not in (p.proowner, 'authenticated'::regrole)
    ) then
      raise exception 'stock_opname check failed: % has unexpected EXECUTE', v_fn;
    end if;

    if not pg_catalog.has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      raise exception 'stock_opname check failed: % not executable by authenticated', v_fn;
    end if;

    foreach v_role in array array['anon', 'service_role'] loop
      if pg_catalog.has_function_privilege(v_role, v_fn, 'EXECUTE') then
        raise exception 'stock_opname check failed: % executable by %', v_fn, v_role;
      end if;
    end loop;
  end loop;

  -- Helpers from migration 20261110090000 that the implementations call:
  -- still SECURITY INVOKER with an empty search_path and unreachable by API
  -- roles.
  foreach v_fn in array array[
    'app_private.require_staff_warehouse()',
    'app_private.require_status_reason(text)'
  ]::regprocedure[] loop
    if not exists (
      select 1
        from pg_catalog.pg_proc as p
       where p.oid = v_fn
         and p.proowner = 'postgres'::regrole
         and not p.prosecdef
         and 'search_path=""' = any (p.proconfig)
    ) then
      raise exception 'stock_opname check failed: helper % definition', v_fn;
    end if;

    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
      if pg_catalog.has_function_privilege(v_role, v_fn, 'EXECUTE') then
        raise exception 'stock_opname check failed: helper % executable by %', v_fn, v_role;
      end if;
    end loop;
  end loop;

  -- Callable public functions: post_stock_movement, the five material
  -- wrappers, and the four opname wrappers. Functions returning
  -- event_trigger are not counted (see migration 20261101064015).
  if (
    select pg_catalog.count(*)
      from pg_catalog.pg_proc as p
     where p.pronamespace = 'public'::regnamespace
       and p.prorettype <> 'pg_catalog.event_trigger'::pg_catalog.regtype
  ) <> 10 then
    raise exception 'stock_opname check failed: unexpected public functions';
  end if;

  -- No write path outside the functions (ADR-15 B5.3).
  foreach v_rel in array array[
    'public.materials',
    'public.stock_opname',
    'public.stock_opname_items',
    'public.inventory_transactions'
  ]::regclass[] loop
    if not exists (
      select 1 from pg_catalog.pg_class as c where c.oid = v_rel and c.relrowsecurity
    ) then
      raise exception 'stock_opname check failed: % RLS', v_rel;
    end if;

    if pg_catalog.has_table_privilege('authenticated', v_rel,
         'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
       or pg_catalog.has_any_column_privilege('authenticated', v_rel,
         'INSERT, UPDATE, REFERENCES') then
      raise exception 'stock_opname check failed: % writable by authenticated', v_rel;
    end if;

    foreach v_role in array array['anon', 'service_role'] loop
      if pg_catalog.has_table_privilege(v_role, v_rel,
           'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
         or pg_catalog.has_any_column_privilege(v_role, v_rel,
           'SELECT, INSERT, UPDATE, REFERENCES') then
        raise exception 'stock_opname check failed: % reachable by %', v_rel, v_role;
      end if;
    end loop;
  end loop;

  if pg_catalog.has_table_privilege('authenticated', 'app_private.idempotency_requests', 'SELECT') then
    raise exception 'stock_opname check failed: idempotency_requests readable by authenticated';
  end if;

  -- At most one ADJUSTMENT per opname item: the last guard against a second
  -- posting of the same item.
  if not exists (
    select 1
      from pg_catalog.pg_index as i
     where i.indexrelid = pg_catalog.to_regclass('public.inventory_transactions_stock_opname_item_id_key')
       and i.indrelid = 'public.inventory_transactions'::regclass
       and i.indisunique
       and i.indisvalid
  ) then
    raise exception 'stock_opname check failed: inventory_transactions_stock_opname_item_id_key';
  end if;
end;
$$;
