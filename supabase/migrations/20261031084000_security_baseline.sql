-- Security baseline (STACK-DECISION-LOG ADR-13 D3, D7; DATABASE-DESIGN §12.4, §14.2 step 0).
--
-- Default-deny for objects created by the migration role `postgres`. These
-- statements change default privileges for FUTURE objects only; privileges on
-- existing objects are unaffected. Every application object must therefore
-- grant its privileges explicitly in the migration that creates it (ADR-13 D4).
--
-- Local audit (31 Oct 2026): pg_default_acl for role postgres in schema public
-- grants anon, authenticated, and service_role full rights on new tables
-- (arwdDxtm), sequences (rwU), and functions (X). Supabase-managed objects are
-- owned by internal roles (supabase_admin, supabase_auth_admin, ...) and are
-- not affected by default privileges of role postgres.

-- Per-schema defaults in public: remove automatic API-role privileges.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated, service_role;

-- Global default: PostgreSQL grants EXECUTE on new functions to PUBLIC. A
-- per-schema entry cannot remove a global default, so this statement has no
-- IN SCHEMA clause and applies to every function (and procedure) that role
-- postgres creates in any schema from now on.
alter default privileges for role postgres
  revoke execute on functions from public;
