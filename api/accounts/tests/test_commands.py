from io import StringIO

import pytest
from django.core.management import CommandError, call_command

from accounts.management.commands.create_practitioner import Command
from accounts.models import User

COMMAND_MODULE = "accounts.management.commands.create_practitioner"


@pytest.fixture
def typed_passwords(monkeypatch):
    """Simulates what the operator types at the two password prompts."""

    def _typed(first, second=None):
        answers = iter([first, first if second is None else second])
        monkeypatch.setattr(f"{COMMAND_MODULE}.getpass", lambda prompt: next(answers))

    return _typed


def create_practitioner(**options):
    out = StringIO()
    options = {"email": "jane.doe@example.com", "first_name": "Jane", "last_name": "Doe"} | options
    call_command("create_practitioner", stdout=out, **options)
    return out.getvalue()


def test_creates_a_practitioner_with_a_hashed_password(db, typed_passwords, password):
    typed_passwords(password)

    output = create_practitioner(email="  Jane.Doe@Example.com ")

    user = User.objects.get()
    assert user.email == "jane.doe@example.com"
    assert (user.first_name, user.last_name) == ("Jane", "Doe")
    assert user.password.startswith("argon2")
    assert user.check_password(password)
    assert str(user.id) in output
    assert user.email not in output


def test_prompts_for_missing_details(db, typed_passwords, password, monkeypatch):
    typed_passwords(password)
    answers = iter(["jane.doe@example.com", "Jane", "Doe"])
    monkeypatch.setattr("builtins.input", lambda prompt: next(answers))

    call_command("create_practitioner", stdout=StringIO())

    assert User.objects.get().email == "jane.doe@example.com"


def test_rejects_mismatched_passwords(db, typed_passwords, password):
    typed_passwords(password, "something-else-entirely")

    with pytest.raises(CommandError, match="do not match"):
        create_practitioner()
    assert not User.objects.exists()


def test_rejects_weak_password(db, typed_passwords):
    typed_passwords("password1234")

    with pytest.raises(CommandError):
        create_practitioner()
    assert not User.objects.exists()


def test_rejects_invalid_email(db, typed_passwords, password):
    typed_passwords(password)

    with pytest.raises(CommandError, match="email"):
        create_practitioner(email="not-an-email")


def test_rejects_duplicate_email_in_any_case(make_user, typed_passwords, password):
    make_user(email="jane.doe@example.com")
    typed_passwords(password)

    with pytest.raises(CommandError, match="already exists"):
        create_practitioner(email="JANE.DOE@example.com")


def test_password_cannot_be_passed_as_an_argument():
    """Arguments leak into shell history and the process list."""
    parser = Command().create_parser("manage.py", "create_practitioner")

    option_strings = {opt for action in parser._actions for opt in action.option_strings}
    assert not any("password" in opt for opt in option_strings)


# --- Non-interactive mode (used to seed local dev accounts) -------------------


def test_no_input_reads_the_password_from_the_environment(db, monkeypatch, password):
    monkeypatch.setenv("PRACTITIONER_PASSWORD", password)

    create_practitioner(no_input=True)

    assert User.objects.get().check_password(password)


def test_no_input_without_password_in_environment_fails(db, monkeypatch):
    monkeypatch.delenv("PRACTITIONER_PASSWORD", raising=False)

    with pytest.raises(CommandError, match="PRACTITIONER_PASSWORD"):
        create_practitioner(no_input=True)


def test_no_input_requires_all_details(db, monkeypatch, password):
    monkeypatch.setenv("PRACTITIONER_PASSWORD", password)

    with pytest.raises(CommandError, match="--email"):
        call_command("create_practitioner", no_input=True, stdout=StringIO())


def test_skip_existing_leaves_an_existing_account_untouched(make_user, monkeypatch, password):
    existing = make_user(email="jane.doe@example.com")
    monkeypatch.setenv("PRACTITIONER_PASSWORD", "another-strong-password-42")

    output = create_practitioner(no_input=True, skip_existing=True)

    assert User.objects.count() == 1
    existing.refresh_from_db()
    assert existing.check_password(password)
    assert "already exists" in output
