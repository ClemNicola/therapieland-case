"""Shared pytest fixtures. All data is fake: never use real patient data in tests."""

import datetime

import pytest

from accounts.models import User
from patients.models import Gender, Patient

PASSWORD = "correct-horse-battery-staple"


@pytest.fixture
def password():
    return PASSWORD


@pytest.fixture
def make_user(db):
    def _make_user(email="jane.doe@example.com", password=PASSWORD, **fields):
        fields.setdefault("first_name", "Jane")
        fields.setdefault("last_name", "Doe")
        return User.objects.create_user(email=email, password=password, **fields)

    return _make_user


@pytest.fixture
def make_patient(db):
    def _make_patient(followed_by=(), **fields):
        fields.setdefault("family_name", "Smith")
        fields.setdefault("given_name", "John")
        fields.setdefault("birth_date", datetime.date(1980, 5, 17))
        fields.setdefault("gender", Gender.MALE)
        patient = Patient.objects.create(**fields)
        patient.practitioners.add(*followed_by)
        return patient

    return _make_patient
