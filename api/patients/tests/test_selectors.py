import uuid

import pytest

from patients.models import Patient
from patients.selectors import patient_get, patient_list


@pytest.fixture
def alice(make_user):
    return make_user(email="alice@example.com")


@pytest.fixture
def bob(make_user):
    return make_user(email="bob@example.com")


def test_patient_list_only_returns_my_active_patients(alice, bob, make_patient):
    mine = make_patient(followed_by=[alice])
    shared = make_patient(followed_by=[alice, bob])
    make_patient(followed_by=[bob])
    make_patient(followed_by=[alice], active=False)
    make_patient()  # followed by nobody

    assert set(patient_list(user=alice)) == {mine, shared}


@pytest.mark.parametrize("case", ["other-practitioner", "archived", "nobody", "unknown"])
def test_patient_get_hides_patients_outside_my_scope(alice, bob, make_patient, case):
    patient_id = {
        "other-practitioner": lambda: make_patient(followed_by=[bob]).id,
        "archived": lambda: make_patient(followed_by=[alice], active=False).id,
        "nobody": lambda: make_patient().id,
        "unknown": uuid.uuid4,
    }[case]()

    with pytest.raises(Patient.DoesNotExist):
        patient_get(user=alice, patient_id=patient_id)
