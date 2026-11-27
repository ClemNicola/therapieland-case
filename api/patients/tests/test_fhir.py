import copy
import datetime

import pytest
from fhir.resources.R4B.patient import Patient as FhirPatient

from patients.fhir import FhirInputError, patient_from_fhir, patient_to_fhir

VALID = {
    "resourceType": "Patient",
    "name": [{"use": "official", "family": "Smith", "given": ["John"]}],
    "telecom": [
        {"system": "phone", "value": "+00 000 000 0001"},
        {"system": "email", "value": "john.smith@example.com"},
    ],
    "gender": "male",
    "birthDate": "1980-05-17",
}


def payload(**changes):
    data = copy.deepcopy(VALID)
    for key, value in changes.items():
        if value is ...:
            data.pop(key, None)
        else:
            data[key] = value
    return data


def issues_of(data, **kwargs):
    with pytest.raises(FhirInputError) as excinfo:
        patient_from_fhir(data, **kwargs)
    return [(issue.code, issue.expression) for issue in excinfo.value.issues]


# --- Model -> FHIR --------------------------------------------------------------


def test_patient_to_fhir_is_a_valid_r4_patient(make_patient):
    patient = make_patient(phone="+00 000 000 0001", email="john.smith@example.com")

    resource = patient_to_fhir(patient)

    FhirPatient.model_validate(resource)  # raises if not valid FHIR R4
    assert resource == {
        "resourceType": "Patient",
        "id": str(patient.id),
        "meta": {"lastUpdated": resource["meta"]["lastUpdated"]},
        "active": True,
        "name": [{"use": "official", "family": "Smith", "given": ["John"]}],
        "telecom": [
            {"system": "phone", "value": "+00 000 000 0001"},
            {"system": "email", "value": "john.smith@example.com"},
        ],
        "gender": "male",
        "birthDate": "1980-05-17",
    }


def test_patient_without_contact_details_has_no_telecom(make_patient):
    assert "telecom" not in patient_to_fhir(make_patient())


# --- FHIR -> model --------------------------------------------------------------


def test_valid_resource_maps_to_model_fields():
    assert patient_from_fhir(VALID) == {
        "family_name": "Smith",
        "given_name": "John",
        "birth_date": datetime.date(1980, 5, 17),
        "gender": "male",
        "phone": "+00 000 000 0001",
        "email": "john.smith@example.com",
    }


def test_optional_elements_default_to_empty():
    data = patient_from_fhir(payload(telecom=...))

    assert (data["phone"], data["email"]) == ("", "")


def test_server_managed_elements_are_ignored():
    """A client can GET a resource, edit it and PUT it back unchanged."""
    data = payload(
        id="0b0e6b4e-0000-4000-8000-000000000000",
        meta={"lastUpdated": "2026-01-01T00:00:00Z"},
        active=False,
    )

    assert patient_from_fhir(data) == patient_from_fhir(VALID)


def test_id_must_match_the_expected_id():
    expected = "0b0e6b4e-0000-4000-8000-000000000000"

    assert patient_from_fhir(payload(id=expected), expected_id=expected)
    assert issues_of(payload(id="another-id"), expected_id=expected) == [("value", "Patient.id")]


@pytest.mark.parametrize(
    ("data", "expected"),
    [
        ([], [("structure", None)]),
        (payload(resourceType="Observation"), [("value", "Patient.resourceType")]),
        (payload(resourceType=...), [("required", "Patient.resourceType")]),
        (payload(foo="bar"), [("structure", "Patient")]),
        (payload(address=[{"city": "Utrecht"}]), [("not-supported", "Patient.address")]),
        (payload(name=...), [("required", "Patient.name")]),
        (payload(name=[]), [("required", "Patient.name")]),
        (payload(name=VALID["name"] * 2), [("not-supported", "Patient.name")]),
        (payload(name=[{"family": "Smith"}]), [("required", "Patient.name[0].given")]),
        (payload(name=[{"given": ["John"]}]), [("required", "Patient.name[0].family")]),
        (
            payload(name=[{"family": "", "given": ["John"]}]),
            [("required", "Patient.name[0].family")],
        ),
        (
            payload(name=[{"family": "Smith", "given": ["John", "Paul"]}]),
            [("not-supported", "Patient.name[0].given")],
        ),
        (
            payload(name=[{"family": "S" * 151, "given": ["John"]}]),
            [("value", "Patient.name[0].family")],
        ),
        (
            payload(name=[{"family": 123, "given": ["John"]}]),
            [("value", "Patient.name[0].family")],
        ),
        (
            payload(name=[{"use": "nickname", "family": "Smith", "given": ["John"]}]),
            [("not-supported", "Patient.name[0].use")],
        ),
        (
            payload(name=[{"text": "John Smith", "family": "Smith", "given": ["John"]}]),
            [("not-supported", "Patient.name[0].text")],
        ),
        (
            payload(name=[{"family": "Smith", "given": ["John"], "foo": "bar"}]),
            [("structure", "Patient.name[0]")],
        ),
        (payload(gender=...), [("required", "Patient.gender")]),
        (payload(gender="nope"), [("value", "Patient.gender")]),
        (payload(birthDate=...), [("required", "Patient.birthDate")]),
        (payload(birthDate="31/05/1980"), [("value", "Patient.birthDate")]),
        (payload(birthDate="1980"), [("value", "Patient.birthDate")]),
        (payload(birthDate="2999-01-01"), [("value", "Patient.birthDate")]),
        (
            payload(telecom=[{"system": "fax", "value": "123"}]),
            [("not-supported", "Patient.telecom[0].system")],
        ),
        (payload(telecom=[{"system": "phone"}]), [("required", "Patient.telecom[0].value")]),
        (
            payload(telecom=[{"system": "email", "value": "not-an-email"}]),
            [("value", "Patient.telecom[0].value")],
        ),
        (
            payload(telecom=[{"system": "phone", "value": "call me maybe"}]),
            [("value", "Patient.telecom[0].value")],
        ),
        (
            payload(telecom=[{"system": "phone", "value": "1"}, {"system": "phone", "value": "2"}]),
            [("not-supported", "Patient.telecom[1]")],
        ),
        (
            payload(telecom=[{"system": "phone", "value": "1", "use": "home"}]),
            [("not-supported", "Patient.telecom[0].use")],
        ),
    ],
)
def test_invalid_resources_are_rejected(data, expected):
    assert issues_of(data) == expected


def test_all_problems_are_reported_at_once():
    issues = issues_of(payload(gender="nope", birthDate="1980", address=[]))

    assert set(issues) == {
        ("value", "Patient.gender"),
        ("value", "Patient.birthDate"),
        ("not-supported", "Patient.address"),
    }


def test_error_messages_never_echo_submitted_values():
    secret = "SECRET-PHI-VALUE"
    data = payload(
        name=[{"family": secret * 20, "given": [secret, secret]}],
        gender=secret,
        birthDate=secret,
        telecom=[{"system": "email", "value": secret}],
        **{secret: secret},
    )

    with pytest.raises(FhirInputError) as excinfo:
        patient_from_fhir(data)

    for issue in excinfo.value.issues:
        assert issue.diagnostics
        assert secret not in issue.diagnostics
        assert secret not in (issue.expression or "")
