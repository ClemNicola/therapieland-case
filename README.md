# Patient Management

A small patient management app for several practitioners in a healthcare setting.
Minimal scope and few layers, with production-level security, privacy and testing.

| Part  | Stack |
|-------|-------|
| `api/` | Python 3.14, Django 6.1, Django REST Framework, drf-spectacular (OpenAPI), PostgreSQL 18 |
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

## Commands

All commands run inside the containers (start the stack with `make up` first).

| Command | Does |
|---------|------|
| `make up` / `down` / `reset` / `logs` / `ps` | Stack lifecycle |
| `make test` / `test-api` / `test-app` | Tests (pytest / vitest) |
| `make lint` / `format` / `typecheck` | Ruff (lint + format), Oxlint, `tsc` |
| `make schema` | Export the OpenAPI schema from Django, then regenerate the frontend client |
| `make migrate` / `makemigrations` / `shell` | Django database and shell |
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
- **Swagger UI loads from a CDN** and is public, like the schema. Both can be restricted once
  authentication exists.

## Environment variables (api)

| Variable | Required | Default |
|----------|----------|---------|
| `DJANGO_SECRET_KEY` | yes | none |
| `DJANGO_ALLOWED_HOSTS` | yes in prod | empty (comma-separated list) |
| `DJANGO_DEBUG` | no | `false` |
| `DJANGO_BEHIND_TLS_PROXY` | no | `false` (trust `X-Forwarded-Proto`) |
| `DJANGO_SECURE_SSL_REDIRECT` | no | `true` when `DEBUG` is off |
| `DJANGO_HSTS_SECONDS` | no | `31536000` |
| `DJANGO_LOG_LEVEL` | no | `INFO` |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST` | yes | none |
| `POSTGRES_PORT` | no | `5432` |
| `POSTGRES_SSLMODE` | no | `prefer` (use `verify-full` across untrusted networks) |
