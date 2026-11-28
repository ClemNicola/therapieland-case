"""Writes to practitioner accounts."""

from django.db import transaction

from accounts.models import User


@transaction.atomic
def user_create(*, email: str, password: str, first_name: str, last_name: str) -> User:
    """Raises IntegrityError if the email is taken (compared case-insensitively)."""
    return User.objects.create_user(
        email=email, password=password, first_name=first_name, last_name=last_name
    )
