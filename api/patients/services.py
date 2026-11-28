"""Writes to patients and their business rules."""

from typing import Any

from django.db import transaction

from accounts.models import User
from patients.models import Patient


@transaction.atomic
def patient_create(*, user: User, data: dict[str, Any]) -> Patient:
    """Creates a patient followed by its creator."""
    patient = Patient.objects.create(**data)
    patient.practitioners.add(user)
    return patient


@transaction.atomic
def patient_update(*, patient: Patient, data: dict[str, Any]) -> Patient:
    """Replaces every editable field (PUT semantics)."""
    for field, value in data.items():
        setattr(patient, field, value)
    patient.save()
    return patient


def patient_add_practitioner(*, patient: Patient, user: User) -> None:
    patient.practitioners.add(user)


@transaction.atomic
def patient_archive(*, patient: Patient, user: User) -> None:
    """The practitioner stops following the patient. The patient is archived
    (active = false, never hard-deleted) once nobody follows it anymore."""
    # Lock the row: two practitioners archiving at the same time must not both see the
    # other as still following, which would leave an active patient nobody can see.
    patient = Patient.objects.select_for_update().get(pk=patient.pk)
    patient.practitioners.remove(user)
    if not patient.practitioners.exists():
        patient.active = False
        patient.save(update_fields=["active", "updated_at"])
