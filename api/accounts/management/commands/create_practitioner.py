import os
from getpass import getpass

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction

from accounts.models import User, normalize_email

PASSWORD_ENV_VAR = "PRACTITIONER_PASSWORD"  # noqa: S105 (a variable name, not a secret)


class Command(BaseCommand):
    help = (
        "Create a practitioner account. The password is prompted (never passed as an "
        f"argument), or read from ${PASSWORD_ENV_VAR} with --no-input."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument("--email")
        parser.add_argument("--first-name")
        parser.add_argument("--last-name")
        parser.add_argument(
            "--no-input",
            "--noinput",
            action="store_true",
            dest="no_input",
            help=f"Don't prompt: all details are required and the password comes from "
            f"${PASSWORD_ENV_VAR}.",
        )
        parser.add_argument(
            "--skip-existing",
            action="store_true",
            help="Succeed without changes if the account already exists (idempotent seeding).",
        )

    def handle(self, *args, **options) -> None:
        no_input = options["no_input"]
        email = normalize_email(self._get(options, "email", "Email", no_input))
        first_name = self._get(options, "first_name", "First name", no_input)
        last_name = self._get(options, "last_name", "Last name", no_input)

        try:
            validate_email(email)
        except ValidationError as error:
            raise CommandError("Invalid email address.") from error

        user = User(email=email, first_name=first_name, last_name=last_name)
        password = self._get_password(no_input)
        try:
            validate_password(password, user)
        except ValidationError as error:
            raise CommandError(" ".join(error.messages)) from error

        try:
            with transaction.atomic():
                user = User.objects.create_user(
                    email=email, password=password, first_name=first_name, last_name=last_name
                )
        except IntegrityError as error:
            if options["skip_existing"]:
                self.stdout.write("Practitioner already exists, skipped.")
                return
            raise CommandError("A practitioner with this email already exists.") from error

        # Only the UUID: command output ends up in terminals and CI logs.
        self.stdout.write(self.style.SUCCESS(f"Created practitioner {user.id}"))

    def _get(self, options: dict, name: str, label: str, no_input: bool) -> str:
        value = (options[name] or "").strip()
        if not value and no_input:
            raise CommandError(f"--{name.replace('_', '-')} is required with --no-input.")
        while not value:
            value = input(f"{label}: ").strip()
        return value

    def _get_password(self, no_input: bool) -> str:
        if no_input:
            password = os.environ.get(PASSWORD_ENV_VAR)
            if not password:
                raise CommandError(f"${PASSWORD_ENV_VAR} must be set with --no-input.")
            return password
        password = getpass("Password: ")
        if password != getpass("Password (again): "):
            raise CommandError("Passwords do not match.")
        return password
