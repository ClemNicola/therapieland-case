import uuid

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.db import models
from django.db.models.functions import Lower


def normalize_email(email: str) -> str:
    return email.strip().lower()


class UserManager(BaseUserManager["User"]):
    use_in_migrations = True

    def create_user(self, email: str, password: str | None = None, **fields) -> User:
        """Accounts are created by the organisation, never through public signup.

        Without a password, the account gets an unusable one and cannot log in.
        """
        if not email:
            raise ValueError("Users must have an email address.")
        user = self.model(email=normalize_email(email), **fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def get_by_natural_key(self, email: str) -> User:
        # Used at login: match the email whatever case the user typed.
        return self.get(email=normalize_email(email))


class User(AbstractBaseUser):
    """A practitioner who logs in to the app with email + password."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS = ["first_name", "last_name"]

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(email=Lower("email")),
                name="accounts_user_email_lowercase",
            ),
        ]

    def __str__(self) -> str:
        return f"User {self.id}"  # no personal data: str() ends up in logs

    def save(self, *args, **kwargs) -> None:
        self.email = normalize_email(self.email)
        super().save(*args, **kwargs)
