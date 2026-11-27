from io import StringIO

import pytest
from django.core.management import CommandError, call_command

from patients.models import Patient


def seed():
    out = StringIO()
    call_command("seed_demo_patients", stdout=out)
    return out.getvalue()


@pytest.fixture
def demo_practitioners(make_user):
    return make_user(email="alice@example.com"), make_user(email="bob@example.com")


def test_seeds_obviously_fake_patients_scoped_per_practitioner(demo_practitioners):
    alice, bob = demo_practitioners

    seed()

    alice_patients = set(alice.patients.values_list("family_name", "given_name"))
    bob_patients = set(bob.patients.values_list("family_name", "given_name"))
    assert alice_patients == {
        ("Demo", "Alpha"),
        ("Demo", "Bravo"),
        ("Demo", "Charlie"),
        ("Demo", "Shared"),
    }
    assert bob_patients == {("Demo", "Delta"), ("Demo", "Echo"), ("Demo", "Shared")}
    assert all(
        email.endswith("@example.com") for email in Patient.objects.values_list("email", flat=True)
    )


def test_seeding_is_idempotent(demo_practitioners):
    seed()

    output = seed()

    assert Patient.objects.count() == 6
    assert "skipped" in output


def test_seeding_requires_the_demo_practitioners(db):
    with pytest.raises(CommandError, match="practitioner"):
        seed()
