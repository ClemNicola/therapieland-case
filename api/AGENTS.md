# Backend (api/): agent reference

Django 6.1 + DRF + drf-spectacular, PostgreSQL 18, Python 3.14, managed with uv.
The app stores **health data** of patients, used by several practitioners: the security
and privacy rules below are mandatory, not guidelines.

The developer comes from NestJS/Java. Use Django names in code and explanations;
mention the NestJS equivalent only when it helps.

## Architecture

`config/` holds project-level wiring only (settings, root URLs). Each domain is a Django
app (`python manage.py startapp <name>`), e.g. `patients/`, with one file per responsibility:

| File | Role (NestJS equivalent) | Rules |
|------|--------------------------|-------|
| `models.py` | Model (entity) | Fields, DB constraints, `TextChoices`. No business logic. |
| `serializers.py` | Serializer (DTO + validation) | Validates input, shapes output. Never writes to the DB: hands validated data to a service. |
| `views.py` | ViewSet / API view (controller) | HTTP only: permissions, call a selector or service, serialize the result. No ORM calls. |
| `services.py` | Services (service) | Plain functions for writes and business rules. Own transactions (`transaction.atomic`). |
| `selectors.py` | Selectors (DAO) | Plain functions for reads, built on the ORM. Always scoped to what the requesting user may access. |
| `fhir.py` | FHIR mapping | Model ↔ FHIR resource conversion (see FHIR). |
| `urls.py` | Routes | DRF router, included from `config/urls.py`. |
| `tests/` | Tests | `test_<file>.py` mirroring the files above. |

- Functions over classes in services and selectors; keyword-only arguments
  (`def patient_create(*, user, data)`); names are `<entity>_<action>` (`patient_get`, `patient_list`).
- Create a file only when it has content: no empty layers.
- No ORM calls outside `selectors.py`, `services.py` and `models.py` (tests excepted).

## Security and privacy

**Access**
- Deny by default: DRF's default permission is `IsAuthenticated`. A public endpoint needs an explicit
  `AllowAny` **and** an entry in `PUBLIC_ENDPOINTS` (`tests/test_security.py`).
- Object-level authorization goes in selectors: a user only ever gets a queryset filtered to what
  they may access. An object outside that scope returns **404, never 403** (don't reveal it exists).
- Django admin stays disabled: it would bypass these rules.

**Authentication**
- Django sessions (HttpOnly cookie) via `accounts.authentication.SessionAuthentication`: unauthenticated
  → 401, forbidden → 403. No tokens or JWT.
- Every unsafe method is CSRF-protected. Login included: an anonymous view that changes state must call
  `SessionAuthentication().enforce_csrf(request)` (DRF skips CSRF for anonymous requests).
- Accounts are created only with `create_practitioner`. Never accept a password as a CLI argument.
- Auth responses never reveal whether an email has an account.
- Rate-limit sensitive anonymous endpoints with a throttle scope in `DEFAULT_THROTTLE_RATES`.

**Identifiers**
- Primary keys are random UUIDs: `id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)`.
  Never expose sequential IDs (enumerable, leak volumes). Not UUIDv7 either: it embeds the creation time.
- The model UUID is the FHIR `Patient.id`. Business identifiers (e.g. a national patient number) are
  separate fields, never primary keys, and never appear in URLs.

**PHI (personal health information: anything that identifies a patient or describes their health)**
- Never in logs, exception messages, or error responses. Log only UUIDs, the user ID, the action and
  the outcome. Never log request/response bodies or serializer data.
- Never in URLs (paths or query strings): only UUIDs. Search and filtering happen client side, so
  endpoints take no search parameters.
- Error responses are generic and never echo submitted values back.
- Store only the fields the product needs (data minimization). Adding a PHI field is a product decision,
  not an implementation detail.

**General**
- Secrets only from environment variables (`config/settings.py` reads them, fails if missing).
- Tests and fixtures use fake data only, never real patient data.
- Add a dependency only when needed, via `make uv cmd="add <pkg>"` (locked in `uv.lock`).

## FHIR

Patient data is exposed as **FHIR R4** resources, built and validated with `fhir.resources.R4B`
(R4B is identical to R4 for Patient). Never import from `fhir.resources` directly (that is R5).

- The database stores a small, flat subset as plain columns, not the full spec and not a JSON blob.
- The API representation is a valid FHIR resource (`"resourceType": "Patient"`). `fhir.py` maps
  model ↔ resource; serializers use it, and every output is validated by `fhir.resources` in tests.
- `fhir.resources` validates structure and types but **not value sets** (it accepts `gender: "nope"`).
  Coded fields are constrained by our `TextChoices`, mirroring the FHIR value set exactly.
- Unsupported FHIR elements in input are rejected with a 400, never silently dropped or stored raw.
- Growing the subset is deliberate: add a column, its mapping, and tests.
- Errors of FHIR endpoints are `OperationOutcome`s (`patients.views.fhir_exception_handler`): a FHIR
  issue code, the element path in `expression`, and a fixed message. Never pass library error text
  (pydantic, DRF) through: it can contain submitted values. Only known element names go in `expression`.
- `DELETE` on a patient = the practitioner stops following it; archived when nobody follows it.
  Patients are never hard-deleted.

## Tests (TDD)

- **Write the failing test first.** Run it, and check it fails for the expected reason before
  implementing. Then make it pass with the simplest code, then refactor.
- pytest function style, plain `assert`, real PostgreSQL test DB (`@pytest.mark.django_db`).
- Build test data with the shared fixtures in `conftest.py` (`make_user`, `make_patient`); fake data only.
- Every endpoint is tested for: unauthenticated access, another user's object (→ 404),
  invalid input (→ 400), and the happy path.
- Test behaviour through the public surface (HTTP for views, function calls for services/selectors).

## API contract

- OpenAPI (drf-spectacular) is the contract the frontend is generated from.
- Give every operation an explicit `operation_id` in `@extend_schema` (it becomes the frontend hook name,
  e.g. `getHealth` → `useGetHealth`).
- After any API change: `make schema`, then commit `openapi.yaml` (a test fails if it is stale).

## Commands

Run from the repo root, stack up (`make up`):

```sh
make test-api                     # pytest
make test-api args="-k patient"   # subset of tests
make lint / make format           # ruff
make schema                       # export openapi.yaml + regenerate the frontend client
make makemigrations / make migrate
make shell                        # Django shell
make seed                         # demo practitioners + patients (idempotent, dev only)
make create-practitioner          # create an account (interactive)
make manage cmd="…"               # any manage.py command
make uv cmd="add <pkg>"           # dependencies, then `make up` to rebuild
```

Before considering work done: `make test`, `make lint`, `make check-deploy` (only the HSTS preload
warning is expected).
