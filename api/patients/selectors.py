"""Read access to patients. Every query is scoped to the requesting practitioner."""

import uuid

from django.db.models import QuerySet

from accounts.models import User
from patients.models import Patient


def patient_list(*, user: User) -> QuerySet[Patient]:
    """The active patients the practitioner follows, sorted by name."""
    return Patient.objects.filter(practitioners=user, active=True).order_by(
        "family_name", "given_name", "id"
    )


def patient_get(*, user: User, patient_id: uuid.UUID) -> Patient:
    """Raises Patient.DoesNotExist if the patient doesn't exist, is archived, or isn't
    followed by the practitioner: callers can't (and must not) tell these cases apart."""
    return patient_list(user=user).get(pk=patient_id)
