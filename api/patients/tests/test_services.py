"""Interleavings of concurrent requests, replayed step by step (a PUT or DELETE loads the
patient, then another request commits before it writes)."""

import pytest

from patients.models import Patient
from patients.selectors import patient_get
from patients.services import patient_archive, patient_update


@pytest.fixture
def alice(make_user):
    return make_user(email="alice@example.com")


def test_update_after_the_last_follower_left_does_not_revive_the_patient(alice, make_patient):
    patient = make_patient(followed_by=[alice])
    loaded = patient_get(user=alice, patient_id=patient.id)  # a PUT loads the patient...
    patient_archive(patient=patient, user=alice)  # ...a DELETE commits first

    with pytest.raises(Patient.DoesNotExist):
        patient_update(user=alice, patient=loaded, data={"given_name": "Late"})

    patient.refresh_from_db()
    assert (patient.active, patient.given_name) == (False, "John")


def test_update_after_unfollowing_a_shared_patient_is_refused(alice, make_user, make_patient):
    bob = make_user(email="bob@example.com")
    patient = make_patient(followed_by=[alice, bob])
    loaded = patient_get(user=alice, patient_id=patient.id)
    patient_archive(patient=patient, user=alice)  # Alice unfollows, Bob still follows

    with pytest.raises(Patient.DoesNotExist):
        patient_update(user=alice, patient=loaded, data={"given_name": "Late"})

    patient.refresh_from_db()
    assert (patient.active, patient.given_name) == (True, "John")


def test_a_second_concurrent_delete_is_not_found(alice, make_patient):
    patient = make_patient(followed_by=[alice])
    loaded = patient_get(user=alice, patient_id=patient.id)
    patient_archive(patient=patient, user=alice)

    with pytest.raises(Patient.DoesNotExist):
        patient_archive(patient=loaded, user=alice)
