---
name: review-backend
description: Read-only review of the backend (api/) against api/AGENTS.md by a fresh subagent that didn't write the code. Findings are proven (test or curl) and reported as a severity-ranked table; nothing is fixed until the user picks. Use when asked to review the backend, or before starting a new step (e.g. the frontend).
---

# Review the backend

1. **Delegate** to one fresh `general-purpose` subagent. Give it the brief below, not your own opinion
   of the code: its read must not be anchored on yours.
2. **Relay** its findings as a table ranked by severity, then your recommendation (fix / document as
   a README trade-off / skip). **Fix nothing**: the user decides which ones.
3. **Then**, for each finding the user picks: write the failing test first, fix it, and replay the
   reviewer's reproduction against the running stack.

## Brief for the subagent

- **Read-only.** Don't edit repo files, commit, or run migrations. Scratch files go in the scratchpad.
- **Reference:** `api/AGENTS.md` (the rules), root `CLAUDE.md` (API contract), and the README.
  README trade-offs are deliberate: flag one only if the code doesn't match it or it hides a real risk.
- **Scope:** all of `api/` (config, apps, tests, `pyproject.toml`, `Dockerfile`, `.dockerignore`), plus
  `docker-compose.yml` and `Makefile` where they affect the backend. Not just the branch diff.
- **Priorities:**
  1. Security and privacy: scoping (404 never 403), CSRF, sessions, throttling and
     `X-Forwarded-For`, user enumeration, PHI in logs/errors/URLs, production settings, containers.
  2. Correctness: races between requests (replay the interleaving step by step), transactions,
     input that gives a **500 instead of a 4xx** (try NUL characters, deep nesting, wrong types,
     oversized bodies), status codes, content types.
  3. Breaches of AGENTS.md rules, then test gaps on security properties, then nits.
- **Prove every finding** with a scratch test against the test DB or a curl on the stack. Demo logins
  are in the README; unsafe requests need `X-CSRFToken` (from the `csrftoken` cookie) and a `Referer`.
  Create data only if needed (family name "Demo"), and list it. Drop anything it can't prove.
- **Allowed checks:** `make test-api`, `make lint`, `make check-deploy`. It may also run the
  `security-review` / `code-review` skills, but they only see the diff.
- **Report:**
  - A table ranked critical → nit with: severity, category, `path:line`, what's wrong, failure
    scenario, how it was verified (confirmed / plausible), and a one-line fix.
  - Then a short "checked and found OK" list, and any data it created.
