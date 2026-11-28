import logging

import pytest
from django.conf import settings
from rest_framework.test import APIClient

from accounts.models import User

CSRF_URL = "/api/auth/csrf/"
LOGIN_URL = "/api/auth/login/"
LOGOUT_URL = "/api/auth/logout/"
ME_URL = "/api/auth/me/"


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def csrf_client():
    """Enforces CSRF checks like a real browser session (the default client skips them)."""
    return APIClient(enforce_csrf_checks=True)


@pytest.fixture
def practitioner(make_user):
    return make_user(email="jane.doe@example.com")


def login(client, email="jane.doe@example.com", password="correct-horse-battery-staple"):
    return client.post(LOGIN_URL, {"email": email, "password": password}, format="json")


# --- CSRF -----------------------------------------------------------------------


def test_csrf_endpoint_sets_the_csrf_cookie(client):
    response = client.get(CSRF_URL)

    assert response.status_code == 204
    assert response.cookies["csrftoken"].value


def test_login_is_rejected_without_csrf_token(csrf_client, practitioner):
    assert login(csrf_client).status_code == 403


def test_login_succeeds_with_csrf_token(csrf_client, practitioner, password):
    token = csrf_client.get(CSRF_URL).cookies["csrftoken"].value

    response = csrf_client.post(
        LOGIN_URL,
        {"email": practitioner.email, "password": password},
        format="json",
        HTTP_X_CSRFTOKEN=token,
    )

    assert response.status_code == 200


def test_logout_is_rejected_without_csrf_token(csrf_client, practitioner):
    csrf_client.force_login(practitioner)

    assert csrf_client.post(LOGOUT_URL).status_code == 403


# --- Login ----------------------------------------------------------------------


def test_login_returns_the_practitioner_and_sets_a_session_cookie(client, practitioner):
    response = login(client)

    assert response.status_code == 200
    assert response.json() == {
        "id": str(practitioner.id),
        "email": "jane.doe@example.com",
        "first_name": "Jane",
        "last_name": "Doe",
    }
    session_cookie = response.cookies[settings.SESSION_COOKIE_NAME]
    assert session_cookie["httponly"] is True
    assert session_cookie["samesite"] == "Lax"


def test_login_accepts_email_in_any_case(client, practitioner):
    assert login(client, email="JANE.DOE@Example.com").status_code == 200


def test_login_rotates_the_session_id(client, practitioner):
    """Protects against session fixation: a session ID set before login is never reused."""
    session = client.session
    session["pre_login"] = True
    session.save()
    pre_login_key = session.session_key

    login(client)

    assert client.cookies[settings.SESSION_COOKIE_NAME].value != pre_login_key


@pytest.mark.parametrize(
    ("email", "password", "is_active"),
    [
        ("jane.doe@example.com", "wrong-password-123", True),  # wrong password
        ("unknown@example.com", "correct-horse-battery-staple", True),  # unknown email
        ("jane.doe@example.com", "correct-horse-battery-staple", False),  # deactivated
    ],
    ids=["wrong-password", "unknown-email", "inactive-account"],
)
def test_failed_logins_are_indistinguishable(client, make_user, email, password, is_active):
    make_user(email="jane.doe@example.com", is_active=is_active)

    response = login(client, email=email, password=password)

    assert response.status_code == 400
    assert response.json() == {"non_field_errors": ["Invalid email or password."]}
    assert settings.SESSION_COOKIE_NAME not in response.cookies


def test_login_requires_email_and_password(client, db):
    response = client.post(LOGIN_URL, {}, format="json")

    assert response.status_code == 400
    assert set(response.json()) == {"email", "password"}


def test_login_rejects_deeply_nested_json(client, db):
    depth = 50_000
    response = client.post(LOGIN_URL, "[" * depth + "]" * depth, content_type="application/json")

    assert response.status_code == 400


def test_login_is_rate_limited_per_ip(client, practitioner):
    for _ in range(5):
        assert login(client, password="wrong-password-123").status_code == 400

    assert login(client).status_code == 429


def test_rate_limit_cannot_be_bypassed_with_a_spoofed_forwarded_header(client, practitioner):
    for attempt in range(5):
        client.post(
            LOGIN_URL,
            {"email": practitioner.email, "password": "wrong-password-123"},
            format="json",
            HTTP_X_FORWARDED_FOR=f"10.0.0.{attempt}",
        )

    response = client.post(
        LOGIN_URL,
        {"email": practitioner.email, "password": "wrong-password-123"},
        format="json",
        HTTP_X_FORWARDED_FOR="10.0.0.99",
    )

    assert response.status_code == 429


def test_login_logs_contain_no_credentials(client, practitioner, caplog):
    caplog.set_level(logging.DEBUG)

    login(client, password="wrong-password-123")
    login(client)

    assert practitioner.email not in caplog.text
    assert "wrong-password-123" not in caplog.text
    assert "correct-horse-battery-staple" not in caplog.text


# --- Me -------------------------------------------------------------------------


def test_me_requires_authentication(client, db):
    response = client.get(ME_URL)

    assert response.status_code == 401
    assert "WWW-Authenticate" in response.headers


def test_me_returns_the_logged_in_practitioner_without_secrets(client, practitioner):
    client.force_login(practitioner)

    response = client.get(ME_URL)

    assert response.status_code == 200
    assert set(response.json()) == {"id", "email", "first_name", "last_name"}
    assert response.json()["id"] == str(practitioner.id)


def test_deactivated_practitioner_loses_access_immediately(client, practitioner):
    client.force_login(practitioner)
    User.objects.filter(pk=practitioner.pk).update(is_active=False)

    assert client.get(ME_URL).status_code == 401


# --- Logout ---------------------------------------------------------------------


def test_logout_ends_the_session(client, practitioner):
    client.force_login(practitioner)

    response = client.post(LOGOUT_URL)

    assert response.status_code == 204
    assert client.get(ME_URL).status_code == 401


def test_logout_requires_authentication(client, db):
    assert client.post(LOGOUT_URL).status_code == 401


def test_logout_rejects_get(client, practitioner):
    client.force_login(practitioner)

    assert client.get(LOGOUT_URL).status_code == 405


# --- Session settings -----------------------------------------------------------


def test_session_expires_after_30_minutes_of_inactivity():
    assert settings.SESSION_COOKIE_AGE == 30 * 60
    assert settings.SESSION_SAVE_EVERY_REQUEST is True  # idle timeout, not absolute


def test_session_cookie_is_not_readable_by_javascript():
    assert settings.SESSION_COOKIE_HTTPONLY is True
    assert settings.SESSION_COOKIE_SAMESITE == "Lax"
