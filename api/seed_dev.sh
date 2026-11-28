#!/bin/sh
# LOCAL DEV ONLY: fake practitioner accounts and patients for reviewers (see README).
# Idempotent: existing accounts are left untouched, patients are seeded once.
# Run by docker-compose.yml on `make up`, and by `make seed`. Excluded from the image
# (.dockerignore): only the dev bind mount makes it available.
set -eu

PRACTITIONER_PASSWORD=alice-local-dev-only python manage.py create_practitioner \
  --no-input --skip-existing --email alice@example.com --first-name Alice --last-name Martin
PRACTITIONER_PASSWORD=bob-local-dev-only python manage.py create_practitioner \
  --no-input --skip-existing --email bob@example.com --first-name Bob --last-name Janssen
python manage.py seed_demo_patients
