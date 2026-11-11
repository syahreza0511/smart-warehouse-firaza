-- Material management RPCs: create, update (including minimum stock), delete,
-- archive, and reactivate (PRD FR-MAT-01 to FR-MAT-11; DATABASE-DESIGN §4.3,
-- §4.4, §7.1, §7.2, §9.1, §12.2, §12.3, §13; STACK-DECISION-LOG ADR-09,
-- ADR-13, ADR-15 B5.3).
--
-- Additive: does not change the five earlier migrations, any table, index,
-- constraint, policy, grant, or the material_stock_status view.
--
-- Owner decisions applied (10 November 2026):
--   * OD-05: archiving a frozen material (active Stock Opname) is rejected.
--   * OD-19: categories stay read-only; this file adds no category write path.
--   * OD-17: no OPENING_BALANCE path; a new material always starts at stock 0.
--
-- Fail-closed authorization (ADR-15 B5.3): API roles keep SELECT only. No
-- INSERT, UPDATE, or DELETE grant is added. DATABASE-DESIGN §12.2 recommended
-- a direct DELETE grant on materials for STAFF_WAREHOUSE; B5.3 withheld it,
-- so deletion is also a function here.
--
-- Pattern (ADR-09, same as post_stock_movement): a SECURITY INVOKER wrapper in
-- public calls a SECURITY DEFINER implementation in app_private that is owned
-- by postgres (BYPASSRLS) and makes every check itself: caller identity and
-- role first, then input, then a row lock on the material, then state checks,
-- then the change, all in one transaction.
--
-- Duplicate protection (DATABASE-DESIGN §9.1): no idempotency key. A repeated
-- create is rejected by the unique name index (NAME_TAKEN), a repeated
-- archive or reactivate by the state check (ALREADY_ARCHIVED, NOT_ARCHIVED),
-- a repeated delete by MATERIAL_NOT_FOUND, and a repeated update writes the
-- same values again.
--
-- Errors: 42501 UNAUTHORIZED (no valid application role) and FORBIDDEN
-- (not STAFF_WAREHOUSE); P0001 with the business code as the message.
--
-- Do not add explicit transaction control or batch-splitting statements to
-- this file (DATABASE-DESIGN §14.1).

-- ---------------------------------------------------------------------------
-- Private helpers. Called only from the implementations below, which run as
-- postgres, so no API role gets EXECUTE on them.
-- ---------------------------------------------------------------------------

-- Caller must have a valid application role and be STAFF_WAREHOUSE. The role
-- helper returns NULL for no profile, a deactivated profile, or a session
-- older than session_valid_after (G1). Returns the caller's user id.
create function app_private.require_staff_warehouse()
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_role public.user_role;
  v_user_id uuid;
begin
  v_role := app_private.current_app_role();
  v_user_id := auth.uid();

  if v_role is null or v_user_id is null then
    raise exception using errcode = '42501', message = 'UNAUTHORIZED';
  end if;

  if v_role <> 'STAFF_WAREHOUSE' then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  return v_user_id;
end;
$$;

-- Name and unit text: 1 to p_max_length characters, no leading or trailing
-- whitespace, no control characters. Values are rejected, never rewritten:
-- the Route Handler trims input before calling, so only a direct RPC call
-- with untrimmed text gets INVALID_NAME / INVALID_UNIT. This keeps "Kardus"
-- and "Kardus " from becoming two names (OD-19, DATABASE-DESIGN §4.2).
create function app_private.material_text_is_valid(p_value text, p_max_length integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_value is not null
     and pg_catalog.char_length(p_value) between 1 and p_max_length
     and p_value !~ '^[[:space:]]'
     and p_value !~ '[[:space:]]$'
     and p_value !~ '[[:cntrl:]]';
$$;

-- Archive and reactivation reason: at least one non-whitespace character and
-- at most 500 characters. Raises REASON_REQUIRED or INVALID_REASON.
create function app_private.require_status_reason(p_reason text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_reason is null or p_reason !~ '[^[:space:]]' then
    raise exception using errcode = 'P0001', message = 'REASON_REQUIRED';
  end if;

  if pg_catalog.char_length(p_reason) > 500 then
    raise exception using errcode = 'P0001', message = 'INVALID_REASON';
  end if;
end;
$$;

-- Minimum stock arrives as numeric so fractions and out-of-range values get
-- INVALID_MINIMUM_STOCK instead of a cast error.
create function app_private.require_minimum_stock(p_minimum_stock numeric)
returns integer
language plpgsql
set search_path = ''
as $$
begin
  if p_minimum_stock is null
     or p_minimum_stock <> pg_catalog.trunc(p_minimum_stock)
     or p_minimum_stock < 0
     or p_minimum_stock > 2147483647 then
    raise exception using errcode = 'P0001', message = 'INVALID_MINIMUM_STOCK';
  end if;

  return p_minimum_stock::integer;
end;
$$;

-- The material as the read model shows it (computed stock status, category
-- name), so every write returns the same shape as GET /api/v1/materials/:id.
create function app_private.material_snapshot(p_material_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select pg_catalog.to_jsonb(v)
    from public.material_stock_status as v
   where v.id = p_material_id;
$$;

revoke all on function
  app_private.require_staff_warehouse(),
  app_private.material_text_is_valid(text, integer),
  app_private.require_status_reason(text),
  app_private.require_minimum_stock(numeric),
  app_private.material_snapshot(uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- create_material (§7.2; FR-MAT-01, FR-MAT-02, FR-MAT-04, FR-MAT-10)
--
-- current_stock is set to 0 explicitly; stock changes only through
-- transactions (opening stock: Stock In with note "Saldo awal", OD-17).
-- ---------------------------------------------------------------------------
create function app_private.create_material(
  p_category_id uuid,
  p_name text,
  p_unit text,
  p_minimum_stock numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_minimum_stock integer;
  v_material_id uuid;
  v_constraint text;
begin
  perform app_private.require_staff_warehouse();

  if not app_private.material_text_is_valid(p_name, 120) then
    raise exception using errcode = 'P0001', message = 'INVALID_NAME';
  end if;

  if not app_private.material_text_is_valid(p_unit, 30) then
    raise exception using errcode = 'P0001', message = 'INVALID_UNIT';
  end if;

  v_minimum_stock := app_private.require_minimum_stock(p_minimum_stock);

  if p_category_id is null
     or not exists (select 1 from public.categories as c where c.id = p_category_id) then
    raise exception using errcode = 'P0001', message = 'CATEGORY_NOT_FOUND';
  end if;

  begin
    insert into public.materials (category_id, name, unit, current_stock, minimum_stock)
    values (p_category_id, p_name, p_unit, 0, v_minimum_stock)
    returning id into v_material_id;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'materials_name_lower_key' then
        raise exception using errcode = 'P0001', message = 'NAME_TAKEN';
      end if;
      raise;
    when foreign_key_violation then
      raise exception using errcode = 'P0001', message = 'CATEGORY_NOT_FOUND';
  end;

  return app_private.material_snapshot(v_material_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- update_material (§7.2; FR-MAT-01, FR-MAT-03, FR-MAT-04, FR-MAT-10, FR-MAT-11)
--
-- Writes name, category, unit, and minimum_stock only. current_stock,
-- active_opname_id, and the archive columns are never touched here.
-- An archived material is rejected outright (Keputusan F). The unit may
-- change only while the material has no transaction and no Stock Opname
-- item. post_stock_movement and the future add_stock_opname_item lock the
-- material row before writing those rows, so holding the lock here keeps the
-- check valid until commit.
-- ---------------------------------------------------------------------------
create function app_private.update_material(
  p_material_id uuid,
  p_category_id uuid,
  p_name text,
  p_unit text,
  p_minimum_stock numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_minimum_stock integer;
  v_material public.materials%rowtype;
  v_constraint text;
begin
  perform app_private.require_staff_warehouse();

  if not app_private.material_text_is_valid(p_name, 120) then
    raise exception using errcode = 'P0001', message = 'INVALID_NAME';
  end if;

  if not app_private.material_text_is_valid(p_unit, 30) then
    raise exception using errcode = 'P0001', message = 'INVALID_UNIT';
  end if;

  v_minimum_stock := app_private.require_minimum_stock(p_minimum_stock);

  if p_material_id is null then
    raise exception using errcode = 'P0001', message = 'MATERIAL_NOT_FOUND';
  end if;

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

  if p_category_id is null
     or not exists (select 1 from public.categories as c where c.id = p_category_id) then
    raise exception using errcode = 'P0001', message = 'CATEGORY_NOT_FOUND';
  end if;

  if p_unit <> v_material.unit and (
    exists (select 1 from public.inventory_transactions as t where t.material_id = p_material_id)
    or exists (select 1 from public.stock_opname_items as i where i.material_id = p_material_id)
  ) then
    raise exception using errcode = 'P0001', message = 'UNIT_LOCKED';
  end if;

  begin
    update public.materials as m
       set category_id = p_category_id,
           name = p_name,
           unit = p_unit,
           minimum_stock = v_minimum_stock
     where m.id = p_material_id;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'materials_name_lower_key' then
        raise exception using errcode = 'P0001', message = 'NAME_TAKEN';
      end if;
      raise;
    when foreign_key_violation then
      raise exception using errcode = 'P0001', message = 'CATEGORY_NOT_FOUND';
  end;

  return app_private.material_snapshot(p_material_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_material (§4.3, §5; FR-MAT-05; Keputusan B)
--
-- Permanent delete only while nothing references the material: no
-- inventory transaction, no Stock Opname item, no status event (so an
-- archived or once-archived material is never deletable). The checks give a
-- clear error; the ON DELETE RESTRICT foreign keys remain the final guard.
-- ---------------------------------------------------------------------------
create function app_private.delete_material(p_material_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_material public.materials%rowtype;
begin
  perform app_private.require_staff_warehouse();

  if p_material_id is null then
    raise exception using errcode = 'P0001', message = 'MATERIAL_NOT_FOUND';
  end if;

  select m.*
    into v_material
    from public.materials as m
   where m.id = p_material_id
     for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'MATERIAL_NOT_FOUND';
  end if;

  if v_material.active_opname_id is not null then
    raise exception using errcode = 'P0001', message = 'MATERIAL_FROZEN';
  end if;

  if v_material.archived_at is not null
     or v_material.current_stock <> 0
     or exists (select 1 from public.inventory_transactions as t where t.material_id = p_material_id)
     or exists (select 1 from public.stock_opname_items as i where i.material_id = p_material_id)
     or exists (select 1 from public.material_status_events as e where e.material_id = p_material_id) then
    raise exception using errcode = 'P0001', message = 'MATERIAL_HAS_HISTORY';
  end if;

  begin
    delete from public.materials as m where m.id = p_material_id;
  exception
    when foreign_key_violation then
      raise exception using errcode = 'P0001', message = 'MATERIAL_HAS_HISTORY';
  end;

  return pg_catalog.jsonb_build_object('id', p_material_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- archive_material (§4.4, §7.2; FR-MAT-06, FR-MAT-07, FR-MAT-09 / OD-05)
--
-- Rejected when already archived, when frozen by an active Stock Opname
-- (OD-05), or when stock is not 0. The archive columns and the ARCHIVED
-- event are written in the same transaction.
-- ---------------------------------------------------------------------------
create function app_private.archive_material(p_material_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_user_id uuid;
  v_material public.materials%rowtype;
begin
  v_user_id := app_private.require_staff_warehouse();

  perform app_private.require_status_reason(p_reason);

  if p_material_id is null then
    raise exception using errcode = 'P0001', message = 'MATERIAL_NOT_FOUND';
  end if;

  select m.*
    into v_material
    from public.materials as m
   where m.id = p_material_id
     for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'MATERIAL_NOT_FOUND';
  end if;

  if v_material.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'ALREADY_ARCHIVED';
  end if;

  if v_material.active_opname_id is not null then
    raise exception using errcode = 'P0001', message = 'MATERIAL_FROZEN';
  end if;

  if v_material.current_stock <> 0 then
    raise exception using errcode = 'P0001', message = 'STOCK_NOT_ZERO';
  end if;

  update public.materials as m
     set archived_at = pg_catalog.now(),
         archived_by = v_user_id
   where m.id = p_material_id;

  insert into public.material_status_events (material_id, event_type, reason, created_by)
  values (p_material_id, 'ARCHIVED', p_reason, v_user_id);

  return app_private.material_snapshot(p_material_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- reactivate_material (§4.4, §7.2; FR-MAT-08)
-- ---------------------------------------------------------------------------
create function app_private.reactivate_material(p_material_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_user_id uuid;
  v_material public.materials%rowtype;
begin
  v_user_id := app_private.require_staff_warehouse();

  perform app_private.require_status_reason(p_reason);

  if p_material_id is null then
    raise exception using errcode = 'P0001', message = 'MATERIAL_NOT_FOUND';
  end if;

  select m.*
    into v_material
    from public.materials as m
   where m.id = p_material_id
     for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'MATERIAL_NOT_FOUND';
  end if;

  if v_material.archived_at is null then
    raise exception using errcode = 'P0001', message = 'NOT_ARCHIVED';
  end if;

  update public.materials as m
     set archived_at = null,
         archived_by = null
   where m.id = p_material_id;

  insert into public.material_status_events (material_id, event_type, reason, created_by)
  values (p_material_id, 'REACTIVATED', p_reason, v_user_id);

  return app_private.material_snapshot(p_material_id);
end;
$$;

-- The wrappers run with the caller's privileges, so authenticated needs
-- EXECUTE on each implementation (ADR-13 D8). Calling an implementation
-- directly from SQL gets the same checks.
revoke all on function
  app_private.create_material(uuid, text, text, numeric),
  app_private.update_material(uuid, uuid, text, text, numeric),
  app_private.delete_material(uuid),
  app_private.archive_material(uuid, text),
  app_private.reactivate_material(uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function
  app_private.create_material(uuid, text, text, numeric),
  app_private.update_material(uuid, uuid, text, text, numeric),
  app_private.delete_material(uuid),
  app_private.archive_material(uuid, text),
  app_private.reactivate_material(uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Public RPC wrappers (ADR-09; §12.3). No logic of their own.
-- ---------------------------------------------------------------------------
create function public.create_material(
  p_category_id uuid,
  p_name text,
  p_unit text,
  p_minimum_stock numeric
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.create_material(p_category_id, p_name, p_unit, p_minimum_stock);
$$;

create function public.update_material(
  p_material_id uuid,
  p_category_id uuid,
  p_name text,
  p_unit text,
  p_minimum_stock numeric
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.update_material(p_material_id, p_category_id, p_name, p_unit, p_minimum_stock);
$$;

create function public.delete_material(p_material_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.delete_material(p_material_id);
$$;

create function public.archive_material(p_material_id uuid, p_reason text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.archive_material(p_material_id, p_reason);
$$;

create function public.reactivate_material(p_material_id uuid, p_reason text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.reactivate_material(p_material_id, p_reason);
$$;

revoke all on function
  public.create_material(uuid, text, text, numeric),
  public.update_material(uuid, uuid, text, text, numeric),
  public.delete_material(uuid),
  public.archive_material(uuid, text),
  public.reactivate_material(uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function
  public.create_material(uuid, text, text, numeric),
  public.update_material(uuid, uuid, text, text, numeric),
  public.delete_material(uuid),
  public.archive_material(uuid, text),
  public.reactivate_material(uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Final check (DATABASE-DESIGN §14.2; ADR-13 D3, D4, D8; ADR-15 B5.3)
--
-- Aborts the whole migration if it did not run as postgres, if the unique
-- name index that NAME_TAKEN relies on is missing, if a function
-- has an unexpected definition or EXECUTE grant, if a helper is reachable by
-- an API role, if the set of callable public functions is not exactly the
-- six wrappers, or if any API role gained a write privilege on the material
-- tables.
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn regprocedure;
  v_rel regclass;
  v_role text;
  v_impls regprocedure[] := array[
    'app_private.create_material(uuid, text, text, numeric)',
    'app_private.update_material(uuid, uuid, text, text, numeric)',
    'app_private.delete_material(uuid)',
    'app_private.archive_material(uuid, text)',
    'app_private.reactivate_material(uuid, text)'
  ]::regprocedure[];
  v_wrappers regprocedure[] := array[
    'public.create_material(uuid, text, text, numeric)',
    'public.update_material(uuid, uuid, text, text, numeric)',
    'public.delete_material(uuid)',
    'public.archive_material(uuid, text)',
    'public.reactivate_material(uuid, text)'
  ]::regprocedure[];
  v_helpers regprocedure[] := array[
    'app_private.require_staff_warehouse()',
    'app_private.material_text_is_valid(text, integer)',
    'app_private.require_status_reason(text)',
    'app_private.require_minimum_stock(numeric)',
    'app_private.material_snapshot(uuid)'
  ]::regprocedure[];
begin
  if current_user <> 'postgres' then
    raise exception 'material_management check failed: current_user is not postgres';
  end if;

  -- NAME_TAKEN is raised only for a violation of this unique index on
  -- lower(name); any other unique violation is re-raised unchanged.
  if not exists (
    select 1
      from pg_catalog.pg_index as i
     where i.indexrelid = pg_catalog.to_regclass('public.materials_name_lower_key')
       and i.indrelid = 'public.materials'::regclass
       and i.indisunique
       and i.indisvalid
  ) then
    raise exception 'material_management check failed: materials_name_lower_key';
  end if;

  -- Implementations: postgres-owned SECURITY DEFINER, empty search_path,
  -- lock_timeout; EXECUTE for owner and authenticated only.
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
      raise exception 'material_management check failed: % definition', v_fn;
    end if;
  end loop;

  -- Wrappers: postgres-owned SECURITY INVOKER, empty search_path.
  foreach v_fn in array v_wrappers loop
    if not exists (
      select 1
        from pg_catalog.pg_proc as p
       where p.oid = v_fn
         and p.proowner = 'postgres'::regrole
         and not p.prosecdef
         and 'search_path=""' = any (p.proconfig)
    ) then
      raise exception 'material_management check failed: % definition', v_fn;
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
      raise exception 'material_management check failed: % has unexpected EXECUTE', v_fn;
    end if;

    if not pg_catalog.has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      raise exception 'material_management check failed: % not executable by authenticated', v_fn;
    end if;

    foreach v_role in array array['anon', 'service_role'] loop
      if pg_catalog.has_function_privilege(v_role, v_fn, 'EXECUTE') then
        raise exception 'material_management check failed: % executable by %', v_fn, v_role;
      end if;
    end loop;
  end loop;

  -- Helpers: postgres-owned, not SECURITY DEFINER, empty search_path, and
  -- no ACL entry for anyone but the owner.
  foreach v_fn in array v_helpers loop
    if not exists (
      select 1
        from pg_catalog.pg_proc as p
       where p.oid = v_fn
         and p.proowner = 'postgres'::regrole
         and not p.prosecdef
         and 'search_path=""' = any (p.proconfig)
    ) or exists (
      select 1
        from pg_catalog.pg_proc as p,
             pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) as a
       where p.oid = v_fn
         and a.grantee <> p.proowner
    ) then
      raise exception 'material_management check failed: helper %', v_fn;
    end if;

    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
      if pg_catalog.has_function_privilege(v_role, v_fn, 'EXECUTE') then
        raise exception 'material_management check failed: helper % executable by %', v_fn, v_role;
      end if;
    end loop;
  end loop;

  -- Callable public functions: post_stock_movement plus the five wrappers.
  -- Functions returning event_trigger are not counted (see the inventory
  -- foundation migration: PostgreSQL never runs them from a direct call).
  if (
    select pg_catalog.count(*)
      from pg_catalog.pg_proc as p
     where p.pronamespace = 'public'::regnamespace
       and p.prorettype <> 'pg_catalog.event_trigger'::pg_catalog.regtype
  ) <> 6 then
    raise exception 'material_management check failed: unexpected public functions';
  end if;

  -- No write path outside the functions (ADR-15 B5.3).
  foreach v_rel in array array[
    'public.categories',
    'public.materials',
    'public.material_status_events',
    'public.inventory_transactions',
    'public.stock_opname_items',
    'public.material_stock_status'
  ]::regclass[] loop
    if pg_catalog.has_table_privilege('authenticated', v_rel,
         'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
       or pg_catalog.has_any_column_privilege('authenticated', v_rel,
         'INSERT, UPDATE, REFERENCES') then
      raise exception 'material_management check failed: % writable by authenticated', v_rel;
    end if;

    foreach v_role in array array['anon', 'service_role'] loop
      if pg_catalog.has_table_privilege(v_role, v_rel,
           'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
         or pg_catalog.has_any_column_privilege(v_role, v_rel,
           'SELECT, INSERT, UPDATE, REFERENCES') then
        raise exception 'material_management check failed: % reachable by %', v_rel, v_role;
      end if;
    end loop;
  end loop;
end;
$$;
