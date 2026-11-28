# Frontend (app/): agent reference

Vite + React 19 (React Compiler) + TypeScript + Tailwind 4, TanStack Query, Zod, Orval.
The app displays **health data** of patients: the privacy rules below are mandatory.

The developer comes from NestJS/Java: explain React idioms briefly when they aren't obvious.

## Layout

| Path | Contents |
|------|----------|
| `src/api/generated/` | Orval output (hooks, types, Zod schemas). Gitignored, regenerated before dev/build/test/typecheck. **Never edit.** |
| `src/api/client.ts` | The only hand-written `fetch` (Orval mutator): session cookie, CSRF header, `ApiError`. |
| `src/api/queryClient.ts` | The TanStack Query client: in-memory cache, retry policy, global 401 handling. |
| `src/<feature>/` | One folder per feature (`auth/`, `patients/`): components, hooks, tests. |
| `src/ui/` | Shared presentational components, only once two features need them. |

Tests sit next to the code: `Foo.tsx` → `Foo.test.tsx`. Create a file or folder only when it has content.

## API

- Only the generated hooks and types (`useListPatients`, `Patient`…). Never write `fetch`, URLs or API
  types by hand (oxlint forbids `fetch` outside `client.ts`).
- `client.ts` sends `credentials: 'include'` and, on unsafe methods, the `csrftoken` cookie value as
  `X-CSRFToken` (fetching `/api/auth/csrf/` first if missing). It reads the cookie on every request:
  login rotates it. If Django rejects the token (403 CSRF), it refreshes the cookie and retries once:
  the request was refused before running, so even a POST is safe to replay.
- HTTP errors reject with `ApiError` (`status`, parsed `body`). On `/api/patients/` the body is a FHIR
  `OperationOutcome`: show `issue[].diagnostics`, map `issue[].expression` to form fields. Never show
  raw error text or stack traces.
- `401` means "log in again": handled once, globally, in `src/api/queryClient.ts` (removes every
  cached query, re-checks `/me`, and `auth/AuthGate` shows the login form). Screens never handle it.
- After any API change: `make schema`.

## Privacy

- No patient data in `localStorage`, `sessionStorage` or IndexedDB (oxlint forbids them), in `console`
  (forbidden too), in URLs (paths hold UUIDs only; search and filter state never goes in the URL), or
  in `document.title`.
- The TanStack Query cache lives in memory only (no persister) and is cleared on logout and on `401`.
- Auth is the HttpOnly session cookie only: never read, store or send a token. The `csrftoken` cookie
  is not a credential, just the CSRF contract.
- Tests use obviously fake data only.

## UI

- Use the `frontend-design` skill for UI work. Keep it simple: Tailwind only, no component library
  (native `<table>`, `<form>`, `<dialog>` cover our needs). Justify any UI dependency first.
- Mobile first: base classes target small screens, add `md:`/`lg:` for larger ones.
- Accessible: semantic elements, a `<label>` for every input, errors linked with `aria-describedby`
  and announced (`role="alert"` / `aria-live`), visible focus, everything usable with the keyboard,
  AA contrast, touch targets ≥ 44px.
- No hand-written `useMemo`/`useCallback`/`memo`: the React Compiler memoizes.

**Lists**: TanStack Table (headless), driven by the generated query data. Search, sort and filter are
client side.

**Forms**: react-hook-form with `zodResolver` (`@hookform/resolvers/zod`). Prefer the generated Zod
schemas (`endpoints.zod.ts`); extend them only for UI-only rules. Map server `OperationOutcome`
issues to fields with `setError`; issues without a known field go to a form-level error.

## Tests (TDD)

- **Write the failing test first**, check it fails for the expected reason, then implement.
- Vitest + Testing Library: query by role, label or text (never test IDs or class names), act with
  user-level events.
- Stub `fetch` at the boundary (`vi.stubGlobal`) with realistic API responses; never mock the
  generated hooks.
- Every screen is tested for: loading, API error, `401`, and the happy path.

## Commands

Run from the repo root, stack up (`make up`):

```sh
make test-app                     # vitest
make lint / make typecheck        # oxlint, tsc
make schema                       # after an API change: openapi.yaml + generated client
make npm cmd="install <pkg>"      # dependencies, then `make up` to rebuild
```

Before considering work done: `make test`, `make lint`, `make typecheck`.
