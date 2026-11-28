# Command aliases (the equivalent of npm scripts for the whole stack).
# Everything runs inside the containers: start the stack with `make up` first.
# Run `make` or `make help` to list the targets.

COMPOSE := docker compose
API := $(COMPOSE) exec api
APP := $(COMPOSE) exec app

.DEFAULT_GOAL := help
.PHONY: help up down reset logs ps test test-api test-app lint format typecheck \
	schema migrate makemigrations seed create-practitioner shell check-deploy manage uv npm

help: ## List available commands
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

## --- Stack -------------------------------------------------------------------
up: ## Build and start db, api and app in the background
	$(COMPOSE) up --build --renew-anon-volumes --wait

down: ## Stop the stack (keeps the database volume)
	$(COMPOSE) down

reset: ## Stop the stack AND delete the database volume
	$(COMPOSE) down --volumes

logs: ## Follow the logs of all services
	$(COMPOSE) logs -f

ps: ## Show service status
	$(COMPOSE) ps

## --- Quality -----------------------------------------------------------------
test: test-api test-app ## Run all tests

test-api: ## Run backend tests (pytest), e.g. make test-api args="-k health"
	$(API) pytest $(args)

test-app: ## Run frontend tests (vitest)
	$(APP) npm test

lint: ## Lint + format check, both sides
	$(API) ruff check .
	$(API) ruff format --check .
	$(APP) npm run lint

format: ## Auto-fix lint issues and format backend code
	$(API) ruff check --fix .
	$(API) ruff format .

typecheck: ## Type-check the frontend
	$(APP) npm run typecheck

## --- API contract ------------------------------------------------------------
schema: ## Export the OpenAPI schema from Django, then regenerate the Orval client
	$(API) python manage.py spectacular --file openapi.yaml --fail-on-warn
	$(APP) npm run generate

## --- Django ------------------------------------------------------------------
migrate: ## Apply database migrations
	$(API) python manage.py migrate

makemigrations: ## Create migrations from model changes
	$(API) python manage.py makemigrations

seed: ## Seed the local demo practitioners and patients (idempotent, dev only)
	$(API) sh seed_dev.sh

create-practitioner: ## Create a practitioner account (prompts for details and password)
	$(API) python manage.py create_practitioner

shell: ## Django shell (REPL with the project loaded)
	$(API) python manage.py shell

check-deploy: ## Django production-readiness checks (with DEBUG off)
	$(API) env DJANGO_DEBUG=false python manage.py check --deploy

manage: ## Any manage.py command, e.g. make manage cmd="showmigrations"
	$(API) python manage.py $(cmd)

## --- Dependencies ------------------------------------------------------------
uv: ## Any uv command in the api, e.g. make uv cmd="add requests"
	$(API) uv $(cmd)

npm: ## Any npm command in the app, e.g. make npm cmd="install dayjs"
	$(APP) npm $(cmd)
