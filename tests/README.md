# Tests

Test harness for Smart Warehouse Firaza. Only the unit tests run in CI (GitHub Actions, before the build). Integration tests change local state, need an isolated local Supabase stack, and run only on purpose with the owner's approval for that checkpoint; CI never runs them, never starts a database, and never applies migrations.

| Folder | What it needs | State it changes |
|---|---|---|
| `unit/` | Node.js only. No network, database, or Supabase Auth | None |
| `integration/http/stock-out.mjs`, `auth-cookie.mjs` | A local Next.js server at `http://127.0.0.1:3000`, the local Supabase database container (read only, `stock-out.mjs` only), demo accounts | Auth: one session per login (all logged out at the end) and Auth audit entries. Inventory: only in the `commit` phase of `stock-out.mjs`, exactly one Stock Out |
| `integration/http/material-crud.mjs` | An isolated, clean local Supabase stack with exactly six migrations (`FIRAZA_TEST_*`), port 3001 free, a production build | Creates DEMO accounts, categories, materials, one Stock In, archive events; one-shot |
| `integration/http/stock-opname.mjs` | An isolated local Supabase stack with seven migrations and the DEMO accounts from `material-crud.mjs` (`FIRAZA_TEST_*`), port 3001 free, a production build | Rotates DEMO passwords, adds one DEMO staff account, `[DEMO] B4S4` materials, Stock Opname sessions, adjustments; one-shot |
| `integration/sql/` | The local Supabase database container and one new STAFF_WAREHOUSE login made for the test | Auth: that login and its logout, and their audit entries. Inventory: none (rolled back) |

## Unit tests

```sh
node --test 'tests/unit/*.test.mjs'
```

They use mocks and source text: request schemas, the command layers behind the Route Handlers (mocked Supabase client), read mappers, client outcome handling (create attempts, count drafts, leave guard), the dashboard read model, and static checks of the Stock Opname migration. They do not prove database commits, row locks, RLS, or authorization in PostgreSQL; those are integration tests.

Node prints a `MODULE_TYPELESS_PACKAGE_JSON` warning because the app's `.js` modules use ESM syntax without `"type": "module"` in `package.json`. It does not affect the results.

## HTTP integration (`integration/http/stock-out.mjs`)

```sh
FIRAZA_DEMO_CREDENTIALS_FILE=/path/outside/the/repo/credentials.json \
node tests/integration/http/stock-out.mjs --phase=pre-rpc,rpc-reject
```

Phases always run in the order `pre-rpc`, `rpc-reject`, `commit`, and none runs by default.

- **Non-mutating phases.** Every request that expects a rejection is built so that the database would still reject it if the guard under test were broken (unknown material, or a quantity no balance can satisfy). A broken guard therefore shows up as a FAIL, not as a stock change. Inventory state is compared in the database before and after each phase.
- **Fail-fast.** The first FAIL stops the run. The commit phase never starts after a failure.
- **Commit phase.** Commits one Stock Out of quantity 1 on `[DEMO] Kardus Medium`. It is permanent: inventory transactions are append-only. It runs only when all of these hold:
  - `pre-rpc` and `rpc-reject` run in the same invocation and pass;
  - `FIRAZA_ALLOW_STOCK_OUT_COMMIT=7SUP.5B-2B`;
  - `FIRAZA_EXPECT_BASELINE=tx=<n>,idem=<n>,kardus_stock=<n>,kardus_tx=<n>` matches the database exactly;
  - no transaction already carries the test note.
- **No re-run.** After one successful commit the baseline and the test-note check no longer hold, so running the commit phase again is refused. Never change the expected baseline to force a second run.
- **After the commit requests are sent: POST-COMMIT NO-RETRY.** The script never retries the commit. If anything after that point does not end cleanly (responses that are not all identical `201`s, a transport error, a failed check, a failed database read, a failed logout, or a failed session check), it prints `POST-COMMIT NO-RETRY` and exits with code `2`. Do not rerun the harness or resend any request; reconcile read-only in the database (transactions, idempotency rows, balances, sessions) and report first.
- **Sessions.** Each account that logs in (staff, owner, and a temporary staff login for the logged-out-cookie test) is logged out independently; a failed logout is a FAIL. Sessions are checked by identity, not only by count: a fingerprint of every session that existed before the run (id, user, timestamps, refresh counter; ids are never printed) must stay identical, and the number of sessions created during the run must match the live logins at each check and be 0 at the end. So sessions that existed before the run, including any residual one, are not used, refreshed, or revoked. If such a session is refreshed by its own browser during the run, the check fails (fail-closed). Each login and logout adds an Auth audit entry; the script prints the before and after counts.
- **Database access.** Only `docker exec … psql` in `READ ONLY` transactions against a local `supabase_db_*` container (override with `FIRAZA_DB_CONTAINER`). Output is limited to counts and checksums.
- Exit codes: `0` all PASS; `1` FAIL or abort before any commit request was sent; `2` POST-COMMIT NO-RETRY.

## Auth cookie attributes (`integration/http/auth-cookie.mjs`)

```sh
FIRAZA_DEMO_CREDENTIALS_FILE=/path/outside/the/repo/credentials.json \
FIRAZA_EXPECT_SECURE_COOKIE=true \
node tests/integration/http/auth-cookie.mjs
```

Checks the `Set-Cookie` attributes of the Supabase auth cookies (F-01) and the login, session, and logout flow. Start the server with the `AUTH_COOKIE_SECURE` value under test and set `FIRAZA_EXPECT_SECURE_COOKIE` to what it must send: `true` when the variable is unset, `true`, or any value other than `false`; `false` only when it is exactly `false`.

- One STAFF_WAREHOUSE login, logged out at the end. No database access and no inventory change.
- Every auth cookie must be `HttpOnly`, `SameSite=Lax`, and `Path=/`, with `Secure` as expected. Logout must clear every auth cookie, and the old cookies must then get 401.
- Exit codes: `0` all PASS; `1` FAIL or abort.

## Material CRUD and Stock Opname integration (`material-crud.mjs`, `stock-opname.mjs`)

```sh
node_modules/.bin/next build
FIRAZA_TEST_API_URL=http://127.0.0.1:<port> \
FIRAZA_TEST_DB_CONTAINER=supabase_db_<project> \
FIRAZA_TEST_SYSTEM_IDENTIFIER=<expected system_identifier> \
FIRAZA_TEST_SUPABASE_WORKDIR=/absolute/path/to/isolated/workdir \
FIRAZA_ALLOW_B3R7=B3-R7 node tests/integration/http/material-crud.mjs   # or FIRAZA_ALLOW_B4S4=B4-S4 … stock-opname.mjs
```

- **Never against a shared or cloud database.** Both refuse to start unless the target is explicitly configured: a loopback API URL, a `supabase_db_*` container, an expected PostgreSQL `system_identifier` that must match the database before anything is written, and an existing Supabase workdir. Each also needs its own opt-in variable.
- **One-shot.** `material-crud.mjs` requires a clean database with exactly the six migrations up to `20261110090000`; `stock-opname.mjs` refuses once its `[DEMO] B4S4` fixtures or any Stock Opname row exist. After one run, a second run is refused; never clean the database to force one.
- **Secrets.** Local keys are read from `supabase status` for the configured workdir and passed only to the child Next.js process; DEMO passwords are random per run and kept in memory. Nothing secret is printed or written.
- **Real concurrency** (`stock-opname.mjs`): a separate `psql` session holds a row lock on a synthetic row (`SELECT … FOR UPDATE`, then `ROLLBACK`; no data change) while overlapping requests queue behind it.
- Results recorded on 10–11 November 2026 (local, isolated stack): `material-crud.mjs` 144/144, `stock-opname.mjs` 303/303.

## Browser QA

Real-browser QA (Chrome through the DevTools Protocol, real input events, three roles, 390/768/1280 px) was run on 11 November 2026 against the local isolated stack. The scripts and screenshots were kept outside the repository and are not part of it. Results: Stock Opname and Material flows 82 + 28 checks, unsaved-count navigation guard 23, draft recovery 23, dashboard 36. The two findings of the first run (in-app navigation and browser Back/Forward silently dropping unsaved counts) were fixed and re-tested in the later runs. States that would need data changes (empty inventory, nothing needing attention, a bounded attention list) were checked with synthetic API responses in the browser and are labelled as simulated. Other browsers were not tested.

## SQL integration (`integration/sql/stock-out-boundary.sql`)

Checks that a Stock Out equal to the whole balance leaves exactly 0 and that one more unit is rejected. See the file header for the exact commands.

1. `-v mode=snapshot` (read only, before logging in) prints `login_after` and `sessions_before`, a fingerprint of the staff user's existing sessions. No session id is printed.
2. Log in once as that staff user.
3. `-v mode=test` with the two values from step 1 (quote `login_after` in the shell; it contains spaces). The script selects the session itself: it must be the only session of that user created after `login_after`, and the fingerprint of the user's other sessions must still match. Pre-existing sessions, including any residual one, therefore cannot be used; an extra or vanished session aborts the test. The snapshot must be less than 30 minutes old.
4. Log out.

- Requires `-v allow=7SUP.5B-2B`. The target must be an active, unfrozen `[DEMO]` material with stock 1 to 10.
- The mutation is meant to be undone twice: by a PL/pgSQL exception block (a subtransaction) that always ends in a rollback sentinel, and by an explicit `BEGIN … ROLLBACK`. The first layer relies on documented PostgreSQL behaviour that has not been exercised in this repository yet; the script checks at run time that the role and JWT claims were restored, and a final check compares all transactions, idempotency rows, and balances with the values before the test.
- Every abort is an SQL error, so `psql` exits non-zero. Check `$?`.

## Credentials and secrets

- Nothing in this folder may contain passwords, tokens, keys, cookies, session ids, or connection strings.
- Demo credentials stay in a private file outside the repository (mode 600). The HTTP harness refuses a file inside the repository or one readable by group or others, and never prints its contents.
- UUIDs of the synthetic `[DEMO]` fixtures are not secrets.
