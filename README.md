# Patient Management

A small patient management app for several practitioners in a healthcare setting.
Minimal scope and few layers, with production-level security, privacy and testing.

| Part  | Stack |
|-------|-------|
| `api/` | Python 3.14, Django 6.1, Django REST Framework, drf-spectacular (OpenAPI), fhir.resources (FHIR R4B), PostgreSQL 18 |
| `app/` | Vite 8, React 19 + React Compiler, TypeScript, Tailwind CSS 4, TanStack Query, Zod, Orval |

## Getting started

Requirements: Docker (with Compose v2) and `make`. Nothing else is needed locally.

```sh
make up      # build and start db + api + app, wait until healthy
make test    # run backend and frontend tests
make help    # list all commands
make down    # stop (keeps data). `make reset` also deletes the database volume.
```

| URL | What |
|-----|------|
| http://localhost:5173 | Frontend (Vite dev server, proxies `/api` to Django) |
| http://localhost:8000/api/health/ | API health check |
| http://localhost:8000/api/docs/ | Swagger UI |
| http://localhost:8000/api/schema/ | OpenAPI schema |
| `localhost:5432` | PostgreSQL (`patients` / `patients-dev-password`, db `patients`) |

### Demo accounts (local dev only)

`make up` seeds two fake practitioner accounts (idempotent: existing accounts are left untouched).
Run `make seed` to seed them again at any time, e.g. after deleting demo data:

| Email | Password |
|-------|----------|
| `alice@example.com` | `alice-local-dev-only` |
| `bob@example.com` | `bob-local-dev-only` |

It also seeds obviously fake patients (family name "Demo", `@example.com` emails, `+00` phone
numbers) to show the scoping: Alice follows *Alpha*, *Bravo* and *Charlie*, Bob follows *Delta* and
*Echo*, and both follow *Shared*.

Create more accounts with `make create-practitioner` (prompts for the details and the password).

### Try the API manually (Swagger UI)

Open **http://localhost:8000/api/docs/**. It uses the same session cookie and CSRF protection as
the frontend, so there is nothing to configure (no token to paste; ignore the "Authorize" button,
the login request sets the cookie):

1. `POST /api/auth/login/` → *Try it out* with `{"email": "alice@example.com", "password": "alice-local-dev-only"}`.
2. Call the patient endpoints (`GET /api/patients/`, `POST`, `PUT`, `DELETE`): you only see Alice's patients.
3. `POST /api/auth/logout/`, then log in as Bob to compare the scoping.

The page only describes the API; every endpoint behind it still requires a login. Swagger UI reads
the `csrftoken` cookie before each unsafe request (login rotates it) and sends it as `X-CSRFToken`.

## Commands

All commands run inside the containers (start the stack with `make up` first).

| Command | Does |
|---------|------|
| `make up` / `down` / `reset` / `logs` / `ps` | Stack lifecycle |
| `make test` / `test-api` / `test-app` | Tests (pytest / vitest) |
| `make lint` / `format` / `typecheck` | Ruff (lint + format), Oxlint, `tsc` |
| `make schema` | Export the OpenAPI schema from Django, then regenerate the frontend client |
| `make migrate` / `makemigrations` / `shell` | Django database and shell |
| `make seed` | Seed the demo practitioners and patients (idempotent, local dev only) |
| `make create-practitioner` | Create a practitioner account (there is no public signup) |
| `make check-deploy` | Django production-readiness checks |
| `make manage cmd="…"` | Any `manage.py` command |
| `make uv cmd="add <pkg>"` | Add or remove backend dependencies |
| `make npm cmd="install <pkg>"` | Add or remove frontend dependencies |

After changing dependencies, rebuild with `make up` (it rebuilds the images and refreshes `node_modules`).

## Technical choices

**API contract: OpenAPI as the single source of truth.** Django's serializers and views generate
the schema (drf-spectacular). It is exported to `api/openapi.yaml` and committed, so contract changes
show up in code review. Orval reads that file to generate typed TanStack Query hooks and Zod schemas
into `app/src/api/generated/`. That folder is not committed; it is regenerated automatically before
`dev`, `build`, `test` and `typecheck`. A backend test fails if `openapi.yaml` is out of date with the code.

**One origin, no CORS.** The Vite dev server proxies `/api` to Django, so the browser only talks to
one origin. That removes a whole class of CORS misconfigurations and keeps cookie-based auth with CSRF
protection simple. In production, put both behind the same reverse proxy.

**Authentication: server-side sessions in an HttpOnly cookie.** Practitioners log in with email +
password (`/api/auth/login/`, `/logout/`, `/me/`). Accounts are created by the organisation with
`create_practitioner`: there is no public signup.
- Sessions instead of tokens/JWT: JavaScript can't read the cookie (an XSS can't steal it), logout and
  deactivation take effect immediately, and the frontend and API share one origin anyway.
- CSRF protection on every unsafe request, login included. The SPA fetches `/api/auth/csrf/`, then
  sends the `csrftoken` cookie value in the `X-CSRFToken` header.
- 30-minute idle timeout. The session ID is rotated at login (session fixation).
- Failed logins return one generic error (no way to discover which emails have an account), and
  login is rate-limited to 5 attempts per minute per IP. The IP is never taken from a client-supplied
  `X-Forwarded-For` header.
- Passwords are hashed with Argon2 and must be 12+ characters and not common. The account creation
  command prompts for the password and never accepts it as an argument (shell history, process list).
- Unauthenticated requests get `401`, forbidden ones `403`.

**Patients: a REST API exposing FHIR R4 resources** (`/api/patients/`, validated with
`fhir.resources.R4B`).
- `GET /` returns a FHIR `Bundle` (searchset) of the practitioner's active patients. `POST /` creates a
  patient followed by its creator (`201` + `Location`). `GET`/`PUT /{id}/` reads/replaces a `Patient`.
- `DELETE /{id}/` means "stop following": it removes the link for the requesting practitioner only.
  The patient is archived (`active = false`, never hard-deleted) once nobody follows it anymore.
- A practitioner only ever reaches the patients they follow. Anything else (someone else's patient,
  archived, unknown or malformed id) returns the same `404`.
- The database stores a small subset of the Patient resource; unsupported FHIR elements are rejected
  with a `400`, never silently dropped.
- Errors are FHIR `OperationOutcome`s with a precise issue code and element path
  (`Patient.birthDate`). Messages are fixed strings: they never echo submitted values (PHI).
- Content type `application/fhir+json` (plain `application/json` also accepted and served on request).

**Secure by default (backend).**
- Configuration comes only from environment variables. `DEBUG` defaults to off, and the app refuses
  to start without `DJANGO_SECRET_KEY` or the database settings.
- DRF denies everything by default (`IsAuthenticated`). Public endpoints must opt out explicitly, and
  a test fails if an endpoint becomes public without being added to the allowlist.
- JSON only (no browsable HTML API, no form parsing). Django admin is not installed (less attack surface).
- Strict security headers: CSP `default-src 'none'` (Django 6 native CSP), `X-Frame-Options: DENY`,
  `nosniff`, `Referrer-Policy`. With `DEBUG` off: HTTPS redirect, HSTS (1 year) and secure cookies.
  HSTS preload is deliberately left off (it is hard to undo), which is why `make check-deploy`
  reports one warning.
- The health check returns no internal error details. Logs go to stdout and must never contain request
  bodies (patient data).
- Containers run as non-root users. The production image runs gunicorn; Compose overrides it with
  `runserver` for hot reload.
- Swagger UI assets are pinned to an exact version on the CDN (instead of `@latest`).

**Dependencies.** Backend: [uv](https://docs.astral.sh/uv/) with `pyproject.toml` (standard PEP 621)
and `uv.lock` (resolved and hashed, so installs are reproducible). Frontend: npm with `package-lock.json`.

**Tests.** Backend: pytest + pytest-django, run against a real PostgreSQL test database (no SQLite
shortcuts). Frontend: Vitest + Testing Library (jsdom).

**Linting.** Ruff (lint + format, including security rules `S`) and Oxlint (the create-vite default).

### Trade-offs

- **Credentials are written in `docker-compose.yml`.** This gives a zero-setup local start. They are
  dev-only values: never reuse them. Any shared or production environment must inject real secrets
  (`DJANGO_SECRET_KEY`, `POSTGRES_PASSWORD`, …) from its environment or a secret manager. To limit
  exposure, all ports are bound to `127.0.0.1` only.
- **The Compose stack is a development setup** (Vite dev server, Django `runserver`, bind mounts).
  A production deployment would build the frontend (`npm run build`), serve it and the API behind a
  TLS reverse proxy (set `DJANGO_BEHIND_TLS_PROXY=true`), and use the api image's default gunicorn command.
- **No field-level encryption of patient data.** It would break database constraints and
  client-side search, and requires key management. Data at rest is protected at the infrastructure
  level (encrypted disks and backups), in transit by TLS (`POSTGRES_SSLMODE`), and in the app by
  access control.
- **Demo accounts with known passwords are seeded on `make up`.** Reviewers can log in right away.
  This is local dev only: the seed script (`api/seed_dev.sh`) is run by the Compose command and
  `make seed`, and is excluded from the image, so a production deployment never creates these accounts.
- **Rate limiting instead of account lockout.** Locking an account after N failures stops slow,
  distributed attacks on one account, but it also lets anyone lock a practitioner out. In production,
  **two-factor authentication** is the better protection for health data: a stolen or guessed password
  alone is no longer enough.
- **The login rate limit is approximate under parallel requests.** DRF's throttle reads then writes
  its counter without a lock, so simultaneous attempts can slip past it (roughly one extra per gunicorn
  worker per window, not unlimited). Acceptable as a brute-force brake; 2FA is the real protection.
- **The 30-minute idle timeout is a default, not a policy.** The organisation's security policy should
  decide it (stricter settings like 15 minutes are common in hospitals). Configure it with
  `DJANGO_SESSION_IDLE_TIMEOUT`.
- **Rate-limit counters use Django's database cache** (shared by all gunicorn workers, no extra
  service). Production deployments must run `python manage.py createcachetable` once, like migrations.
  Redis would be the choice under heavy load.
- **Swagger UI loads from a CDN** and is public, like the schema. Both describe routes and shapes,
  never data, and every data endpoint still requires a login. A deployment that wants to hide its
  API surface can restrict `SERVE_PERMISSIONS` in `SPECTACULAR_SETTINGS`.
- **No server-side search, filters or pagination**: the list returns all of a practitioner's active
  patients and the frontend searches them. Fine for a caseload of hundreds of patients, simpler, and
  no PHI in URLs (search terms). With thousands per practitioner, add FHIR search parameters and paging.
- **Deleting a shared patient only unfollows it.** Archiving when Alice deletes would make the patient
  disappear for Bob, who still treats them. So `DELETE` removes the requesting practitioner's link, and
  the patient is archived only when the last practitioner stops following it (the check locks the row,
  so concurrent deletes can't leave an active patient nobody follows). Consequence: a patient is never
  hidden from colleagues by one practitioner's action.
- **Unfollowing is not reversible from the app.** Re-following would require searching patients you
  don't follow, which breaks access scoping (a practitioner only ever sees their own patients).
- **No optimistic locking** (FHIR `ETag` / `If-Match`): if two practitioners edit the same patient at
  the same time, the last write wins.
- **Archived patients return `404`**, not FHIR's `410 Gone`, and there is no restore endpoint yet.
- **No `PATCH`**: updates replace the whole resource (`PUT`), which a FHIR client does by default.
- **One name, one phone and one email per patient** (data minimization; FHIR allows lists).
- **Request bodies are capped at 100 KB** (`DATA_UPLOAD_MAX_MEMORY_SIZE`; a patient is ~1 KB) and
  FHIR input deeper than 10 levels is rejected. A production reverse proxy should enforce a body limit too.

## Next steps

- **Audit trail of patient data access**: record who created, read, updated or deleted which patient,
  and when (IDs only, no PHI), append-only and written in the same transaction as the change.

## Environment variables (api)

| Variable | Required | Default |
|----------|----------|---------|
| `DJANGO_SECRET_KEY` | yes | none |
| `DJANGO_ALLOWED_HOSTS` | yes in prod | empty (comma-separated list) |
| `DJANGO_DEBUG` | no | `false` |
| `DJANGO_BEHIND_TLS_PROXY` | no | `false` (trust `X-Forwarded-Proto` and one `X-Forwarded-For` hop) |
| `DJANGO_SECURE_SSL_REDIRECT` | no | `true` when `DEBUG` is off |
| `DJANGO_HSTS_SECONDS` | no | `31536000` |
| `DJANGO_LOG_LEVEL` | no | `INFO` |
| `DJANGO_SESSION_IDLE_TIMEOUT` | no | `1800` (seconds) |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST` | yes | none |
| `POSTGRES_PORT` | no | `5432` |
| `POSTGRES_SSLMODE` | no | `prefer` (use `verify-full` across untrusted networks) |
