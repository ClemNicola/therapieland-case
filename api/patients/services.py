"""Writes to patients and their business rules."""

from typing import Any

from django.db import transaction

from accounts.models import User
from patients.models import Patient
from patients.selectors import patient_list


@transaction.atomic
def patient_create(*, user: User, data: dict[str, Any]) -> Patient:
    """Creates a patient followed by its creator."""
    patient = Patient.objects.create(**data)
    patient.practitioners.add(user)
    return patient


def _lock_followed(*, user: User, patient: Patient) -> Patient:
    """Re-reads the patient under a row lock, still scoped to the practitioner.

    The view loaded `patient` earlier: a concurrent DELETE may have committed since
    (unfollowed, or archived it). Raises Patient.DoesNotExist (→ 404) in that case.
    """
    return patient_list(user=user).select_for_update(of=("self",)).get(pk=patient.pk)


@transaction.atomic
def patient_update(*, user: User, patient: Patient, data: dict[str, Any]) -> Patient:
    """Replaces every editable field (PUT semantics)."""
    patient = _lock_followed(user=user, patient=patient)
    for field, value in data.items():
        setattr(patient, field, value)
    # Only the submitted fields: never write back a stale `active`.
    patient.save(update_fields=[*data, "updated_at"])
    return patient


def patient_add_practitioner(*, patient: Patient, user: User) -> None:
    patient.practitioners.add(user)


@transaction.atomic
def patient_archive(*, patient: Patient, user: User) -> None:
    """The practitioner stops following the patient. The patient is archived
    (active = false, never hard-deleted) once nobody follows it anymore."""
    # Lock the row: two practitioners archiving at the same time must not both see the
    # other as still following, which would leave an active patient nobody can see.
    patient = _lock_followed(user=user, patient=patient)
    patient.practitioners.remove(user)
    if not patient.practitioners.exists():
        patient.active = False
        patient.save(update_fields=["active", "updated_at"])
