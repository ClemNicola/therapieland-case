import uuid

from django.conf import settings
from django.db import models


class Gender(models.TextChoices):
    """FHIR AdministrativeGender, mirrored exactly (required binding of Patient.gender)."""

    MALE = "male", "Male"
    FEMALE = "female", "Female"
    OTHER = "other", "Other"
    UNKNOWN = "unknown", "Unknown"


class Patient(models.Model):
    """A basic patient record, exposed later as a FHIR R4 Patient resource.

    FHIR mapping (implemented in fhir.py with the CRUD step):
        id                      -> Patient.id
        family_name, given_name -> Patient.name[0] (use "official"; family, given = [given_name])
        birth_date              -> Patient.birthDate
        gender                  -> Patient.gender
        phone, email            -> Patient.telecom (system "phone" / "email")
        active                  -> Patient.active
        updated_at              -> Patient.meta.lastUpdated
        practitioners           -> not mapped: access control, not patient data
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    family_name = models.CharField(max_length=150)
    given_name = models.CharField(max_length=150)
    birth_date = models.DateField()
    gender = models.CharField(max_length=7, choices=Gender.choices)
    phone = models.CharField(max_length=32, blank=True)
    email = models.EmailField(blank=True)
    # Archive instead of deleting: medical records have legal retention periods.
    active = models.BooleanField(default=True)
    # The practitioners following this patient (and allowed to access the record).
    practitioners = models.ManyToManyField(
        settings.AUTH_USER_MODEL, related_name="patients", blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(gender__in=Gender.values),
                name="patients_patient_gender_valid",
            ),
            models.CheckConstraint(
                condition=~models.Q(family_name=""),
                name="patients_patient_family_name_not_empty",
            ),
            models.CheckConstraint(
                condition=~models.Q(given_name=""),
                name="patients_patient_given_name_not_empty",
            ),
        ]

    def __str__(self) -> str:
        return f"Patient {self.id}"  # no PHI: str() ends up in logs
