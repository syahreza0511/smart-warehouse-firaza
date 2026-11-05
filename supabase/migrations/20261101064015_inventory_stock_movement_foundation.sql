-- Inventory foundation and stock movement RPC (STACK-DECISION-LOG ADR-08,
-- ADR-09, ADR-13, ADR-15 B5.1–B5.3; DATABASE-DESIGN §4.0, §4.2–§4.9, §6,
-- §7.1, §7.2 post_stock_movement, §9, §12.2, §12.3, §13, §14.2 steps 2–7).
--
-- Additive: does not change the four earlier migrations, public.profiles,
-- app_private.current_app_role(), or the account lifecycle objects. Tables,
-- RLS, policies, grants, functions, the view, and the final privilege check
-- are written together in this one file (ADR-13 D4). Do not add explicit
-- transaction control or batch-splitting statements to this file
-- (DATABASE-DESIGN §14.1).
--
-- Fail-closed authorization (ADR-15 B5.3): API roles get SELECT only, through
-- RLS that requires app_private.current_app_role(). Every stock change goes
-- through app_private.post_stock_movement, which checks identity, role,
-- input, idempotency, and material state itself.
--
-- Out of scope here: Stock Opname functions (stock_opname tables are schema
-- only and nothing writes them), material and category writes (OD-19),
-- OPENING_BALANCE (OD-17), corrections, and Owner Notes.

-- ---------------------------------------------------------------------------
-- Enums (DATABASE-DESIGN §4.0)
-- ---------------------------------------------------------------------------
create type public.transaction_type as enum (
  'OPENING_BALANCE', 'STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'REVERSAL'
);

create type public.opname_status as enum ('ACTIVE', 'POSTED', 'CANCELLED');

create type public.material_status_event_type as enum ('ARCHIVED', 'REACTIVATED');

-- ---------------------------------------------------------------------------
-- Append-only guard for immutable history tables (§4.4, §4.5)
--
-- Rejects ordinary UPDATE, DELETE, and TRUNCATE. ENABLE ALWAYS keeps the
-- triggers active under session_replication_role = replica. The table owner
-- (postgres) and superusers can still disable or drop these triggers; this
-- is not tamper-proofing against them.
-- ---------------------------------------------------------------------------
create function app_private.inventory_history_reject_change()
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

revoke all on function app_private.inventory_history_reject_change()
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- categories (§4.2)
--
-- Unique lower(name) is required. Whitespace normalization and the category
-- write path follow OD-19, so no API role can write this table yet.
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  name text not null check (pg_catalog.btrim(name) <> ''),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create unique index categories_name_lower_key
  on public.categories (pg_catalog.lower(name));

create trigger categories_set_updated_at
  before update on public.categories
  for each row
  execute function app_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- materials (§4.3). The active_opname_id FK is added after stock_opname.
-- ---------------------------------------------------------------------------
create table public.materials (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete restrict,
  name text not null check (pg_catalog.btrim(name) <> ''),
  unit text not null check (pg_catalog.btrim(unit) <> ''),
  current_stock integer not null default 0 check (current_stock >= 0),
  minimum_stock integer not null check (minimum_stock >= 0),
  active_opname_id uuid,
  archived_at timestamptz,
  archived_by uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint materials_archive_pair_check
    check ((archived_at is null) = (archived_by is null)),
  constraint materials_archived_zero_stock_check
    check (archived_at is null or current_stock = 0)
);

-- Includes archived materials (Keputusan A).
create unique index materials_name_lower_key
  on public.materials (pg_catalog.lower(name));

create index materials_category_id_idx
  on public.materials (category_id);

create trigger materials_set_updated_at
  before update on public.materials
  for each row
  execute function app_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- material_status_events (§4.4). Append-only; no writer function yet.
-- ---------------------------------------------------------------------------
create table public.material_status_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  material_id uuid not null references public.materials (id) on delete restrict,
  event_type public.material_status_event_type not null,
  reason text not null check (pg_catalog.btrim(reason) <> ''),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now()
);

create index material_status_events_material_created_idx
  on public.material_status_events (material_id, created_at);

create trigger material_status_events_no_update_delete
  before update or delete on public.material_status_events
  for each row
  execute function app_private.inventory_history_reject_change();

create trigger material_status_events_no_truncate
  before truncate on public.material_status_events
  for each statement
  execute function app_private.inventory_history_reject_change();

alter table public.material_status_events
  enable always trigger material_status_events_no_update_delete;

alter table public.material_status_events
  enable always trigger material_status_events_no_truncate;

-- ---------------------------------------------------------------------------
-- stock_opname and stock_opname_items (§4.6, §4.7), schema only.
--
-- Columns and constraints are fully specified by the design and do not
-- depend on OD-01, OD-02, OD-05, OD-16, or OD-20, which govern function
-- behaviour. No function writes these tables in this migration, so no
-- material can be frozen through the API yet.
-- ---------------------------------------------------------------------------
create table public.stock_opname (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  status public.opname_status not null default 'ACTIVE',
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  posted_by uuid references public.profiles (id) on delete restrict,
  posted_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete restrict,
  cancelled_at timestamptz,
  cancel_reason text,
  constraint stock_opname_status_columns_check check (
    case status
      when 'ACTIVE' then
        posted_by is null and posted_at is null
        and cancelled_by is null and cancelled_at is null and cancel_reason is null
      when 'POSTED' then
        posted_by is not null and posted_at is not null
        and cancelled_by is null and cancelled_at is null and cancel_reason is null
      when 'CANCELLED' then
        posted_by is null and posted_at is null
        and cancelled_by is not null and cancelled_at is not null
        and cancel_reason is not null and pg_catalog.btrim(cancel_reason) <> ''
    end
  )
);

create index stock_opname_status_idx
  on public.stock_opname (status);

create table public.stock_opname_items (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  stock_opname_id uuid not null references public.stock_opname (id) on delete restrict,
  material_id uuid not null references public.materials (id) on delete restrict,
  system_stock integer not null check (system_stock >= 0),
  counted_stock integer check (counted_stock >= 0),
  added_by uuid not null references public.profiles (id) on delete restrict,
  added_at timestamptz not null default pg_catalog.now(),
  counted_by uuid references public.profiles (id) on delete restrict,
  counted_at timestamptz,
  constraint stock_opname_items_opname_material_key
    unique (stock_opname_id, material_id),
  constraint stock_opname_items_count_columns_check check (
    (counted_stock is null and counted_by is null and counted_at is null)
    or (counted_stock is not null and counted_by is not null and counted_at is not null)
  )
);

create index stock_opname_items_material_id_idx
  on public.stock_opname_items (material_id);

alter table public.materials
  add constraint materials_active_opname_id_fkey
  foreign key (active_opname_id) references public.stock_opname (id) on delete restrict;

create index materials_active_opname_id_idx
  on public.materials (active_opname_id)
  where active_opname_id is not null;

-- ---------------------------------------------------------------------------
-- inventory_transactions (§4.5). Final rows: never updated or deleted.
--
-- OPENING_BALANCE has no approved rule (OD-17), so the sign check accepts no
-- OPENING_BALANCE row at all until a later migration defines it.
-- ---------------------------------------------------------------------------
create table public.inventory_transactions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  material_id uuid not null references public.materials (id) on delete restrict,
  type public.transaction_type not null,
  quantity_delta integer not null,
  notes text,
  stock_opname_id uuid references public.stock_opname (id) on delete restrict,
  stock_opname_item_id uuid references public.stock_opname_items (id) on delete restrict,
  reversed_transaction_id uuid references public.inventory_transactions (id) on delete restrict,
  replaces_transaction_id uuid references public.inventory_transactions (id) on delete restrict,
  correction_reason text,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  constraint inventory_transactions_quantity_sign_check check (
    case type
      when 'STOCK_IN' then quantity_delta > 0
      when 'STOCK_OUT' then quantity_delta < 0
      when 'ADJUSTMENT' then quantity_delta <> 0
      when 'REVERSAL' then quantity_delta <> 0
      else false
    end
  ),
  constraint inventory_transactions_opname_refs_check check (
    case type
      when 'ADJUSTMENT' then stock_opname_id is not null and stock_opname_item_id is not null
      else stock_opname_id is null and stock_opname_item_id is null
    end
  ),
  constraint inventory_transactions_reversal_refs_check check (
    case type
      when 'REVERSAL' then
        reversed_transaction_id is not null
        and correction_reason is not null and pg_catalog.btrim(correction_reason) <> ''
      else reversed_transaction_id is null
    end
  ),
  constraint inventory_transactions_replaces_check check (
    replaces_transaction_id is null or type not in ('ADJUSTMENT', 'REVERSAL')
  )
);

create index inventory_transactions_material_created_idx
  on public.inventory_transactions (material_id, created_at);

create index inventory_transactions_created_at_idx
  on public.inventory_transactions (created_at);

create index inventory_transactions_stock_opname_id_idx
  on public.inventory_transactions (stock_opname_id);

create unique index inventory_transactions_reversed_transaction_id_key
  on public.inventory_transactions (reversed_transaction_id)
  where reversed_transaction_id is not null;

create unique index inventory_transactions_replaces_transaction_id_key
  on public.inventory_transactions (replaces_transaction_id)
  where replaces_transaction_id is not null;

create unique index inventory_transactions_stock_opname_item_id_key
  on public.inventory_transactions (stock_opname_item_id)
  where stock_opname_item_id is not null;

create trigger inventory_transactions_no_update_delete
  before update or delete on public.inventory_transactions
  for each row
  execute function app_private.inventory_history_reject_change();

create trigger inventory_transactions_no_truncate
  before truncate on public.inventory_transactions
  for each statement
  execute function app_private.inventory_history_reject_change();

alter table public.inventory_transactions
  enable always trigger inventory_transactions_no_update_delete;

alter table public.inventory_transactions
  enable always trigger inventory_transactions_no_truncate;

-- ---------------------------------------------------------------------------
-- idempotency_requests (§4.8, §9; ADR-13 D6)
--
-- Shared by every idempotent operation: (user_id, key) is unique across
-- operations, and the operation name is stored and part of request_hash.
-- A row is written in the same transaction as its mutation, so a failed
-- operation leaves no row behind (§9.4).
-- ---------------------------------------------------------------------------
create table app_private.idempotency_requests (
  user_id uuid not null references public.profiles (id) on delete restrict,
  key text not null check (pg_catalog.btrim(key) <> ''),
  operation text not null check (pg_catalog.btrim(operation) <> ''),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  response jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (user_id, key)
);

-- ---------------------------------------------------------------------------
-- RLS and grants (§12.2; ADR-13 D3, D4, D7; ADR-15 B5.3)
--
-- Read for users whose helper role is not NULL (active profile and a valid
-- session after any cutoff). No API role gets INSERT, UPDATE, DELETE, or
-- TRUNCATE. service_role gets nothing: seed data is written from a trusted
-- SQL session.
-- ---------------------------------------------------------------------------
alter table public.categories enable row level security;
alter table public.materials enable row level security;
alter table public.material_status_events enable row level security;
alter table public.stock_opname enable row level security;
alter table public.stock_opname_items enable row level security;
alter table public.inventory_transactions enable row level security;
alter table app_private.idempotency_requests enable row level security;

revoke all on table
  public.categories,
  public.materials,
  public.material_status_events,
  public.stock_opname,
  public.stock_opname_items,
  public.inventory_transactions,
  app_private.idempotency_requests
  from public, anon, authenticated, service_role;

grant select on table
  public.categories,
  public.materials,
  public.material_status_events,
  public.stock_opname,
  public.stock_opname_items,
  public.inventory_transactions
  to authenticated;

create policy categories_select_active
  on public.categories
  for select
  to authenticated
  using ((select app_private.current_app_role()) is not null);

create policy materials_select_active
  on public.materials
  for select
  to authenticated
  using ((select app_private.current_app_role()) is not null);

create policy material_status_events_select_active
  on public.material_status_events
  for select
  to authenticated
  using ((select app_private.current_app_role()) is not null);

create policy stock_opname_select_active
  on public.stock_opname
  for select
  to authenticated
  using ((select app_private.current_app_role()) is not null);

create policy stock_opname_items_select_active
  on public.stock_opname_items
  for select
  to authenticated
  using ((select app_private.current_app_role()) is not null);

create policy inventory_transactions_select_active
  on public.inventory_transactions
  for select
  to authenticated
  using ((select app_private.current_app_role()) is not null);

-- idempotency_requests: no policy, so RLS denies every API role.

-- ---------------------------------------------------------------------------
-- Stock movement implementation (§7.1, §7.2, §9.3, §13; ADR-09; ADR-15 B5.3)
--
-- SECURITY DEFINER owned by postgres (BYPASSRLS), so every check is made
-- here and none is delegated to the wrapper or the Route Handler. Order:
--   1. caller identity and role, before any replay can be returned;
--   2. input validation;
--   3. idempotency row (ON CONFLICT DO NOTHING waits on a concurrent
--      transaction holding the same key, then replays or rejects);
--   4. material row lock and state checks;
--   5. transaction row, stock update, stored response, all in one
--      transaction.
-- Any error rolls back the idempotency row together with the mutation.
--
-- Errors: 42501 UNAUTHORIZED (no valid application role) and FORBIDDEN
-- (not STAFF_WAREHOUSE); P0001 for business codes.
-- ---------------------------------------------------------------------------
create function app_private.post_stock_movement(
  p_material_id uuid,
  p_type text,
  p_quantity numeric,
  p_notes text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_operation constant text := 'post_stock_movement';
  v_role public.user_role;
  v_user_id uuid;
  v_type public.transaction_type;
  v_quantity integer;
  v_delta integer;
  v_hash text;
  v_inserted boolean;
  v_existing app_private.idempotency_requests%rowtype;
  v_material public.materials%rowtype;
  v_new_stock bigint;
  v_transaction public.inventory_transactions%rowtype;
  v_response jsonb;
begin
  -- 1. Identity and role. The helper returns NULL for no profile, a
  -- deactivated profile, or a session older than session_valid_after (G1).
  v_role := app_private.current_app_role();
  v_user_id := auth.uid();

  if v_role is null or v_user_id is null then
    raise exception using errcode = '42501', message = 'UNAUTHORIZED';
  end if;

  if v_role <> 'STAFF_WAREHOUSE' then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  -- 2. Input. Quantity arrives as numeric so fractions and out-of-range
  -- values get INVALID_QUANTITY instead of a cast error.
  if p_type is null or p_type not in ('STOCK_IN', 'STOCK_OUT') then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSACTION_TYPE';
  end if;

  if p_quantity is null
     or p_quantity <> pg_catalog.trunc(p_quantity)
     or p_quantity < 1
     or p_quantity > 2147483647 then
    raise exception using errcode = 'P0001', message = 'INVALID_QUANTITY';
  end if;

  if p_idempotency_key is null or pg_catalog.btrim(p_idempotency_key) = '' then
    raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_KEY_REQUIRED';
  end if;

  if pg_catalog.char_length(p_idempotency_key) > 200 then
    raise exception using errcode = 'P0001', message = 'INVALID_IDEMPOTENCY_KEY';
  end if;

  if p_material_id is null then
    raise exception using errcode = 'P0001', message = 'MATERIAL_NOT_FOUND';
  end if;

  v_type := p_type::public.transaction_type;
  v_quantity := p_quantity::integer;
  v_delta := case v_type when 'STOCK_IN' then v_quantity else -v_quantity end;

  -- 3. Idempotency (§9.2): the key itself is not hashed; the operation is.
  v_hash := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
      'v', 'firaza.inventory.v1',
      'operation', v_operation,
      'material_id', p_material_id::text,
      'type', v_type::text,
      'quantity', v_quantity,
      'notes', p_notes
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

  -- 4. Material lock and state (§11.4, §13.2).
  select m.*
    into v_material
    from public.materials as m
   where m.id = p_material_id
     for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'MATERIAL_NOT_FOUND';
  end if;

  if v_material.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'MATERIAL_ARCHIVED';
  end if;

  if v_material.active_opname_id is not null then
    raise exception using errcode = 'P0001', message = 'MATERIAL_FROZEN';
  end if;

  v_new_stock := v_material.current_stock::bigint + v_delta;

  if v_new_stock < 0 then
    raise exception using errcode = 'P0001', message = 'INSUFFICIENT_STOCK';
  end if;

  if v_new_stock > 2147483647 then
    raise exception using errcode = 'P0001', message = 'STOCK_LIMIT_EXCEEDED';
  end if;

  -- 5. Transaction, balance, and stored response (§6.2).
  insert into public.inventory_transactions (material_id, type, quantity_delta, notes, created_by)
  values (p_material_id, v_type, v_delta, p_notes, v_user_id)
  returning * into v_transaction;

  update public.materials as m
     set current_stock = v_new_stock::integer
   where m.id = p_material_id;

  v_response := pg_catalog.jsonb_build_object(
    'transaction_id', v_transaction.id,
    'material_id', v_transaction.material_id,
    'type', v_transaction.type,
    'quantity', v_quantity,
    'quantity_delta', v_transaction.quantity_delta,
    'current_stock', v_new_stock,
    'notes', v_transaction.notes,
    'created_by', v_transaction.created_by,
    'created_at', v_transaction.created_at
  );

  update app_private.idempotency_requests as r
     set response = v_response
   where r.user_id = v_user_id
     and r.key = p_idempotency_key;

  return v_response;
end;
$$;

revoke all on function app_private.post_stock_movement(uuid, text, numeric, text, text)
  from public, anon, authenticated, service_role;

-- The wrapper runs with the caller's privileges, so authenticated needs
-- EXECUTE on this implementation (ADR-13 D8). Calling it directly from SQL
-- gets the same checks.
grant execute on function app_private.post_stock_movement(uuid, text, numeric, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Public RPC wrapper (ADR-09; §12.3). No logic of its own.
-- ---------------------------------------------------------------------------
create function public.post_stock_movement(
  p_material_id uuid,
  p_type text,
  p_quantity numeric,
  p_notes text default null,
  p_idempotency_key text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.post_stock_movement(p_material_id, p_type, p_quantity, p_notes, p_idempotency_key);
$$;

revoke all on function public.post_stock_movement(uuid, text, numeric, text, text)
  from public, anon, authenticated, service_role;

grant execute on function public.post_stock_movement(uuid, text, numeric, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Stock status read model (§6.1; ADR-13 D5)
--
-- security_invoker = true, so the caller's RLS on materials and categories
-- applies. Status is computed on read and never stored.
-- ---------------------------------------------------------------------------
create view public.material_stock_status
with (security_invoker = true)
as
select
  m.id,
  m.category_id,
  c.name as category_name,
  m.name,
  m.unit,
  m.current_stock,
  m.minimum_stock,
  case
    when m.current_stock = 0 then 'OUT_OF_STOCK'
    when m.current_stock <= m.minimum_stock then 'LOW_STOCK'
    else 'NORMAL'
  end as stock_status,
  m.active_opname_id is not null as is_frozen,
  m.archived_at,
  m.created_at,
  m.updated_at
from public.materials as m
join public.categories as c on c.id = m.category_id;

revoke all on table public.material_stock_status
  from public, anon, authenticated, service_role;

grant select on table public.material_stock_status to authenticated;

-- ---------------------------------------------------------------------------
-- Final check (DATABASE-DESIGN §14.2; ADR-13 D3, D4, D5, D7, D8)
--
-- Aborts the whole migration if it did not run as postgres, if a function
-- has an unexpected definition or EXECUTE grant, if an API role holds any
-- table privilege other than authenticated SELECT on the public inventory
-- tables and view, if RLS, the policies, the view option, or the
-- append-only triggers are missing, or if an earlier object changed shape.
-- ---------------------------------------------------------------------------
do $$
declare
  v_rel regclass;
  v_fn regprocedure;
  v_role text;
  v_public_tables regclass[] := array[
    'public.categories',
    'public.materials',
    'public.material_status_events',
    'public.stock_opname',
    'public.stock_opname_items',
    'public.inventory_transactions'
  ]::regclass[];
begin
  if current_user <> 'postgres' then
    raise exception 'inventory_foundation check failed: current_user is not postgres';
  end if;

  -- Functions: owner, security mode, search_path, and EXECUTE holders.
  if not exists (
    select 1
      from pg_catalog.pg_proc as p
     where p.oid = 'app_private.post_stock_movement(uuid, text, numeric, text, text)'::regprocedure
       and p.proowner = 'postgres'::regrole
       and p.prosecdef
       and 'search_path=""' = any (p.proconfig)
       and 'lock_timeout=5s' = any (p.proconfig)
  ) then
    raise exception 'inventory_foundation check failed: private implementation definition';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_proc as p
     where p.oid = 'public.post_stock_movement(uuid, text, numeric, text, text)'::regprocedure
       and p.proowner = 'postgres'::regrole
       and not p.prosecdef
       and 'search_path=""' = any (p.proconfig)
  ) then
    raise exception 'inventory_foundation check failed: public wrapper definition';
  end if;

  foreach v_fn in array array[
    'app_private.post_stock_movement(uuid, text, numeric, text, text)',
    'public.post_stock_movement(uuid, text, numeric, text, text)'
  ]::regprocedure[]
  loop
    if exists (
      select 1
        from pg_catalog.pg_proc as p,
             pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) as a
       where p.oid = v_fn
         and a.grantee not in (p.proowner, 'authenticated'::regrole)
    ) then
      raise exception 'inventory_foundation check failed: % has unexpected EXECUTE', v_fn;
    end if;

    if not pg_catalog.has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      raise exception 'inventory_foundation check failed: % not executable by authenticated', v_fn;
    end if;

    foreach v_role in array array['anon', 'service_role'] loop
      if pg_catalog.has_function_privilege(v_role, v_fn, 'EXECUTE') then
        raise exception 'inventory_foundation check failed: % executable by %', v_fn, v_role;
      end if;
    end loop;
  end loop;

  if not exists (
    select 1
      from pg_catalog.pg_proc as p
     where p.oid = 'app_private.inventory_history_reject_change()'::regprocedure
       and p.proowner = 'postgres'::regrole
       and not p.prosecdef
       and 'search_path=""' = any (p.proconfig)
  ) or exists (
    select 1
      from pg_catalog.pg_proc as p,
           pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) as a
     where p.oid = 'app_private.inventory_history_reject_change()'::regprocedure
       and a.grantee <> p.proowner
  ) then
    raise exception 'inventory_foundation check failed: append-only trigger function';
  end if;

  -- The only callable function in public is the stock movement wrapper; the
  -- earlier foundation exposes no function there. Functions returning
  -- event_trigger are not counted: PostgreSQL runs them only from an event
  -- trigger and rejects any direct call through SQL or the Data API. A
  -- Supabase project can have one in public, for example rls_auto_enable for
  -- the ensure_rls event trigger that enables RLS on new public tables.
  if (
    select pg_catalog.count(*)
      from pg_catalog.pg_proc as p
     where p.pronamespace = 'public'::regnamespace
       and p.prorettype <> 'pg_catalog.event_trigger'::pg_catalog.regtype
  ) <> 1 then
    raise exception 'inventory_foundation check failed: unexpected public functions';
  end if;

  -- Tables: RLS on, no API privilege except authenticated SELECT.
  foreach v_rel in array v_public_tables || 'app_private.idempotency_requests'::regclass loop
    if not exists (
      select 1 from pg_catalog.pg_class as c where c.oid = v_rel and c.relrowsecurity
    ) then
      raise exception 'inventory_foundation check failed: % RLS', v_rel;
    end if;
  end loop;

  foreach v_rel in array v_public_tables || array[
    'public.material_stock_status',
    'app_private.idempotency_requests'
  ]::regclass[] loop
    if exists (
      select 1
        from pg_catalog.pg_class as c,
             pg_catalog.aclexplode(c.relacl) as a
       where c.oid = v_rel
         and a.grantee <> c.relowner
         and not (
           a.grantee = 'authenticated'::regrole
           and a.privilege_type = 'SELECT'
           and v_rel <> 'app_private.idempotency_requests'::regclass
         )
    ) then
      raise exception 'inventory_foundation check failed: % has unexpected privileges', v_rel;
    end if;

    foreach v_role in array array['anon', 'service_role'] loop
      if pg_catalog.has_table_privilege(v_role, v_rel,
           'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
         or pg_catalog.has_any_column_privilege(v_role, v_rel,
           'SELECT, INSERT, UPDATE, REFERENCES') then
        raise exception 'inventory_foundation check failed: % reachable by %', v_rel, v_role;
      end if;
    end loop;

    if pg_catalog.has_table_privilege('authenticated', v_rel,
         'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
       or pg_catalog.has_any_column_privilege('authenticated', v_rel,
         'INSERT, UPDATE, REFERENCES') then
      raise exception 'inventory_foundation check failed: % writable by authenticated', v_rel;
    end if;
  end loop;

  if pg_catalog.has_table_privilege('authenticated', 'app_private.idempotency_requests', 'SELECT') then
    raise exception 'inventory_foundation check failed: idempotency_requests readable by authenticated';
  end if;

  -- Policies: exactly one SELECT policy for authenticated per public table,
  -- none on idempotency_requests.
  foreach v_rel in array v_public_tables loop
    if (
      select pg_catalog.count(*)
        from pg_catalog.pg_policy as pol
       where pol.polrelid = v_rel
         and pol.polcmd = 'r'
         and pol.polpermissive
         and pol.polroles = array['authenticated'::regrole]::oid[]
    ) <> 1 or (
      select pg_catalog.count(*) from pg_catalog.pg_policy as pol where pol.polrelid = v_rel
    ) <> 1 then
      raise exception 'inventory_foundation check failed: % policy set', v_rel;
    end if;
  end loop;

  if exists (
    select 1 from pg_catalog.pg_policy as pol
     where pol.polrelid = 'app_private.idempotency_requests'::regclass
  ) then
    raise exception 'inventory_foundation check failed: idempotency_requests policy';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_class as c
     where c.oid = 'public.material_stock_status'::regclass
       and 'security_invoker=true' = any (c.reloptions)
  ) then
    raise exception 'inventory_foundation check failed: view security_invoker';
  end if;

  if (
    select pg_catalog.count(*)
      from pg_catalog.pg_trigger as t
     where t.tgrelid in ('public.inventory_transactions'::regclass,
                         'public.material_status_events'::regclass)
       and t.tgname in ('inventory_transactions_no_update_delete',
                        'inventory_transactions_no_truncate',
                        'material_status_events_no_update_delete',
                        'material_status_events_no_truncate')
       and t.tgenabled = 'A'
  ) <> 4 then
    raise exception 'inventory_foundation check failed: append-only triggers';
  end if;

  -- Earlier foundation unchanged in the properties this file relies on.
  if not exists (
    select 1
      from pg_catalog.pg_proc as p
     where p.oid = 'app_private.current_app_role()'::regprocedure
       and p.prosecdef
       and p.provolatile = 's'
  ) or not exists (
    select 1 from pg_catalog.pg_class as c
     where c.oid = 'public.profiles'::regclass and c.relrowsecurity
  ) then
    raise exception 'inventory_foundation check failed: authorization foundation';
  end if;
end;
$$;
