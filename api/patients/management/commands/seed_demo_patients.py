"""LOCAL DEV ONLY: seeds obviously fake patients for the demo practitioners.

Run by docker-compose after the demo accounts are created, never in production.
"""

import datetime

from django.core.management.base import BaseCommand, CommandError

from accounts.models import User
from accounts.selectors import user_get_by_email
from patients.models import Gender
from patients.selectors import patient_list
from patients.services import patient_add_practitioner, patient_create

ALICE, BOB = "alice@example.com", "bob@example.com"

# (given name, gender, birth date, followed by): family name is always "Demo".
DEMO_PATIENTS = [
    ("Alpha", Gender.FEMALE, datetime.date(1970, 1, 1), [ALICE]),
    ("Bravo", Gender.MALE, datetime.date(1980, 2, 2), [ALICE]),
    ("Charlie", Gender.OTHER, datetime.date(1990, 3, 3), [ALICE]),
    ("Delta", Gender.FEMALE, datetime.date(2000, 4, 4), [BOB]),
    ("Echo", Gender.UNKNOWN, datetime.date(2010, 5, 5), [BOB]),
    ("Shared", Gender.MALE, datetime.date(1960, 6, 6), [ALICE, BOB]),
]


class Command(BaseCommand):
    help = "LOCAL DEV ONLY: seed fake patients for the demo practitioners (idempotent)."

    def handle(self, *args, **options) -> None:
        try:
            practitioners = {
                email: user_get_by_email(email=email) for email in (ALICE, BOB)
            }
        except User.DoesNotExist as error:
            raise CommandError("Create the demo practitioners first.") from error

        if patient_list(user=practitioners[ALICE]).exists():
            self.stdout.write("Demo patients already exist, skipped.")
            return

        for number, (given_name, gender, birth_date, followers) in enumerate(DEMO_PATIENTS, 1):
            creator, *others = (practitioners[email] for email in followers)
            data = {
                "family_name": "Demo",
                "given_name": given_name,
                "gender": gender,
                "birth_date": birth_date,
                "phone": f"+00 000 000 {number:04d}",
                "email": f"{given_name.lower()}.demo@example.com",
            }
            patient = patient_create(user=creator, data=data)
            for other in others:
                patient_add_practitioner(patient=patient, user=other)

        self.stdout.write(self.style.SUCCESS(f"Seeded {len(DEMO_PATIENTS)} demo patients."))
