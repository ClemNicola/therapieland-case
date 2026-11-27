import pytest
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import IntegrityError

from accounts.models import User


def test_user_is_the_auth_user_model():
    assert get_user_model() is User


def test_user_has_no_username_staff_or_permission_fields():
    field_names = {field.name for field in User._meta.get_fields()}

    assert field_names.isdisjoint({"username", "is_staff", "is_superuser", "groups"})


def test_primary_key_is_a_random_uuid(make_user):
    assert make_user().id.version == 4


def test_email_is_normalized_to_lowercase(make_user):
    user = make_user(email="  Jane.Doe@Example.COM ")

    assert user.email == "jane.doe@example.com"


def test_email_is_unique_regardless_of_case(make_user):
    make_user(email="jane.doe@example.com")

    with pytest.raises(IntegrityError):
        make_user(email="JANE.DOE@example.com")


def test_database_rejects_non_lowercase_email(make_user):
    user = make_user()

    with pytest.raises(IntegrityError):
        User.objects.filter(pk=user.pk).update(email="Jane.Doe@example.com")


def test_email_is_required(db, password):
    with pytest.raises(ValueError):
        User.objects.create_user(email="", password=password)


def test_password_is_hashed_with_argon2(make_user, password):
    user = make_user()

    assert user.password.startswith("argon2")
    assert password not in user.password
    assert user.check_password(password)


def test_user_created_without_password_cannot_log_in(make_user):
    user = make_user(password=None)

    assert not user.has_usable_password()


def test_authenticates_with_email_in_any_case(make_user, password):
    user = make_user(email="jane.doe@example.com")

    assert authenticate(email="JANE.DOE@example.com", password=password) == user


def test_inactive_user_cannot_authenticate(make_user, password):
    make_user(email="jane.doe@example.com", is_active=False)

    assert authenticate(email="jane.doe@example.com", password=password) is None


def test_str_contains_no_personal_data(make_user):
    user = make_user()

    assert user.email not in str(user)
    assert user.last_name not in str(user)


@pytest.mark.parametrize("weak_password", ["Xk9#mQ2$vL", "password1234", "123456789012"])
def test_weak_passwords_are_rejected(weak_password):
    with pytest.raises(ValidationError):
        validate_password(weak_password)


def test_strong_password_is_accepted(password):
    validate_password(password)
