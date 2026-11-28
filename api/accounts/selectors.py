"""Read access to practitioner accounts."""

from accounts.models import User


def user_get_by_email(*, email: str) -> User:
    """Raises User.DoesNotExist. The email is compared case-insensitively."""
    return User.objects.get_by_natural_key(email)
