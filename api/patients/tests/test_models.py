import pytest
from django.db import IntegrityError

from patients.models import Gender

# FHIR R4 AdministrativeGender, a *required* binding of Patient.gender:
# https://hl7.org/fhir/R4/valueset-administrative-gender.html
FHIR_ADMINISTRATIVE_GENDER = {"male", "female", "other", "unknown"}


def test_gender_choices_mirror_the_fhir_value_set():
    assert set(Gender.values) == FHIR_ADMINISTRATIVE_GENDER


def test_patient_defaults(make_patient):
    patient = make_patient()

    assert patient.id.version == 4
    assert patient.active is True
    assert patient.phone == ""
    assert patient.email == ""
    assert patient.created_at is not None
    assert patient.updated_at is not None


def test_database_rejects_gender_outside_the_fhir_value_set(make_patient):
    with pytest.raises(IntegrityError):
        make_patient(gender="nope")


@pytest.mark.parametrize("field", ["family_name", "given_name"])
def test_database_rejects_empty_names(make_patient, field):
    with pytest.raises(IntegrityError):
        make_patient(**{field: ""})


def test_patient_can_be_followed_by_several_practitioners(make_patient, make_user):
    alice = make_user(email="alice@example.com")
    bob = make_user(email="bob@example.com")
    patient = make_patient()

    patient.practitioners.add(alice, bob)

    assert set(patient.practitioners.all()) == {alice, bob}


def test_practitioner_can_follow_several_patients(make_patient, make_user):
    alice = make_user()
    first, second = make_patient(), make_patient(family_name="Brown")

    alice.patients.add(first, second)

    assert set(alice.patients.all()) == {first, second}


def test_str_contains_no_personal_data(make_patient):
    patient = make_patient(family_name="Smith", given_name="John")

    assert "Smith" not in str(patient)
    assert "John" not in str(patient)
