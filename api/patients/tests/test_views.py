import uuid

import pytest
from fhir.resources.R4B.bundle import Bundle
from fhir.resources.R4B.operationoutcome import OperationOutcome
from fhir.resources.R4B.patient import Patient as FhirPatient
from rest_framework.test import APIClient

from patients.models import Patient

LIST_URL = "/api/patients/"
FHIR_JSON = "application/fhir+json"
NOT_FOUND = {
    "resourceType": "OperationOutcome",
    "issue": [{"severity": "error", "code": "not-found", "diagnostics": "Patient not found."}],
}

NEW_PATIENT = {
    "resourceType": "Patient",
    "name": [{"use": "official", "family": "Doe", "given": ["Jane"]}],
    "telecom": [{"system": "phone", "value": "+00 000 000 0001"}],
    "gender": "female",
    "birthDate": "1990-01-31",
}


def detail_url(patient_or_id):
    return f"/api/patients/{getattr(patient_or_id, 'id', patient_or_id)}/"


def outcome_codes(response):
    """Asserts the body is a valid FHIR OperationOutcome and returns its (code, expression)s."""
    body = response.json()
    OperationOutcome.model_validate(body)
    assert response["Content-Type"] == FHIR_JSON
    return [(issue["code"], (issue.get("expression") or [None])[0]) for issue in body["issue"]]


@pytest.fixture
def alice(make_user):
    return make_user(email="alice@example.com", first_name="Alice")


@pytest.fixture
def bob(make_user):
    return make_user(email="bob@example.com", first_name="Bob")


@pytest.fixture
def client(alice):
    client = APIClient()
    client.force_login(alice)
    return client


@pytest.fixture
def bob_client(bob):
    client = APIClient()
    client.force_login(bob)
    return client


# --- Authentication & CSRF --------------------------------------------------------


@pytest.mark.parametrize(
    ("method", "url"),
    [
        ("get", LIST_URL),
        ("post", LIST_URL),
        ("get", detail_url(uuid.uuid4())),
        ("put", detail_url(uuid.uuid4())),
        ("delete", detail_url(uuid.uuid4())),
    ],
)
def test_every_endpoint_requires_authentication(db, method, url):
    response = getattr(APIClient(), method)(url, NEW_PATIENT, format="json")

    assert response.status_code == 401
    assert "WWW-Authenticate" in response.headers
    assert outcome_codes(response) == [("login", None)]


def test_unsafe_requests_require_a_csrf_token(alice):
    client = APIClient(enforce_csrf_checks=True)
    client.force_login(alice)

    response = client.post(LIST_URL, NEW_PATIENT, format="json")

    assert response.status_code == 403
    assert outcome_codes(response) == [("forbidden", None)]
    assert not Patient.objects.exists()


# --- List -------------------------------------------------------------------------


def test_list_returns_only_my_active_patients_as_a_fhir_bundle(client, alice, bob, make_patient):
    zoe = make_patient(family_name="Zimmer", given_name="Zoe", followed_by=[alice])
    adam = make_patient(family_name="Abbott", given_name="Adam", followed_by=[alice, bob])
    make_patient(family_name="Hidden", followed_by=[bob])  # someone else's patient
    make_patient(family_name="Archived", followed_by=[alice], active=False)

    response = client.get(LIST_URL)

    assert response.status_code == 200
    assert response["Content-Type"] == FHIR_JSON
    bundle = response.json()
    Bundle.model_validate(bundle)
    assert bundle["type"] == "searchset"
    assert bundle["total"] == 2
    assert [entry["resource"]["id"] for entry in bundle["entry"]] == [str(adam.id), str(zoe.id)]
    assert bundle["entry"][0]["fullUrl"] == f"http://testserver{detail_url(adam)}"


def test_list_is_empty_bundle_without_patients(client):
    response = client.get(LIST_URL)

    assert response.status_code == 200
    assert response.json() == {"resourceType": "Bundle", "type": "searchset", "total": 0}


def test_list_also_answers_plain_json_when_asked(client):
    response = client.get(LIST_URL, HTTP_ACCEPT="application/json")

    assert response.status_code == 200
    assert response["Content-Type"] == "application/json"


# --- Create -----------------------------------------------------------------------


@pytest.mark.parametrize("content_type", [FHIR_JSON, "application/json"])
def test_create_links_the_patient_to_its_creator(client, alice, content_type):
    import json

    response = client.post(LIST_URL, json.dumps(NEW_PATIENT), content_type=content_type)

    assert response.status_code == 201
    patient = Patient.objects.get()
    assert list(patient.practitioners.all()) == [alice]
    assert response["Location"] == f"http://testserver{detail_url(patient)}"
    resource = response.json()
    FhirPatient.model_validate(resource)
    assert resource["id"] == str(patient.id)
    assert resource["name"] == NEW_PATIENT["name"]
    assert resource["active"] is True


def test_create_rejects_invalid_resource_without_echoing_values(client):
    secret = "SECRET-PHI-VALUE"
    invalid = {**NEW_PATIENT, "gender": secret, "birthDate": secret}

    response = client.post(LIST_URL, invalid, format="json")

    assert response.status_code == 400
    assert set(outcome_codes(response)) == {
        ("value", "Patient.gender"),
        ("value", "Patient.birthDate"),
    }
    assert secret not in response.content.decode()
    assert not Patient.objects.exists()


def test_create_rejects_malformed_json(client):
    response = client.post(LIST_URL, "{not json", content_type=FHIR_JSON)

    assert response.status_code == 400
    assert outcome_codes(response) == [("structure", None)]


def test_create_rejects_unsupported_content_type(client):
    response = client.post(LIST_URL, "family=Doe", content_type="text/plain")

    assert response.status_code == 415
    assert outcome_codes(response) == [("not-supported", None)]


def test_unsupported_accept_header_is_rejected(client):
    response = client.get(LIST_URL, HTTP_ACCEPT="text/html")

    assert response.status_code == 406
    assert outcome_codes(response) == [("not-supported", None)]


# --- Retrieve ---------------------------------------------------------------------


def test_retrieve_my_patient(client, alice, make_patient):
    patient = make_patient(followed_by=[alice])

    response = client.get(detail_url(patient))

    assert response.status_code == 200
    assert response["Content-Type"] == FHIR_JSON
    FhirPatient.model_validate(response.json())
    assert response.json()["id"] == str(patient.id)


@pytest.mark.parametrize("case", ["other-practitioner", "archived", "unknown", "malformed"])
def test_inaccessible_patients_are_indistinguishable(client, alice, bob, make_patient, case):
    target = {
        "other-practitioner": lambda: make_patient(followed_by=[bob]).id,
        "archived": lambda: make_patient(followed_by=[alice], active=False).id,
        "unknown": uuid.uuid4,
        "malformed": lambda: "not-a-uuid",
    }[case]()

    for method in ("get", "put", "delete"):
        response = getattr(client, method)(detail_url(target), NEW_PATIENT, format="json")

        assert response.status_code == 404, method
        assert response.json() == NOT_FOUND
        assert response["Content-Type"] == FHIR_JSON


# --- Update -----------------------------------------------------------------------


def test_update_replaces_the_whole_resource(client, alice, make_patient):
    patient = make_patient(followed_by=[alice], phone="+00 000 000 0009", email="old@example.com")
    resource = client.get(detail_url(patient)).json()

    resource["name"][0]["family"] = "Renamed"
    resource["telecom"] = [{"system": "email", "value": "new@example.com"}]  # phone removed
    response = client.put(detail_url(patient), resource, format="json")

    assert response.status_code == 200
    patient.refresh_from_db()
    assert (patient.family_name, patient.phone, patient.email) == ("Renamed", "", "new@example.com")
    assert response.json()["name"][0]["family"] == "Renamed"
    assert response.json()["meta"]["lastUpdated"] != resource["meta"]["lastUpdated"]


def test_update_rejects_a_mismatched_id(client, alice, make_patient):
    patient = make_patient(followed_by=[alice])

    response = client.put(
        detail_url(patient), {**NEW_PATIENT, "id": str(uuid.uuid4())}, format="json"
    )

    assert response.status_code == 400
    assert outcome_codes(response) == [("value", "Patient.id")]


def test_update_rejects_invalid_resource(client, alice, make_patient):
    patient = make_patient(followed_by=[alice])

    response = client.put(detail_url(patient), {**NEW_PATIENT, "gender": "nope"}, format="json")

    assert response.status_code == 400
    assert outcome_codes(response) == [("value", "Patient.gender")]
    patient.refresh_from_db()
    assert patient.gender == "male"


def test_partial_update_is_not_supported(client, alice, make_patient):
    patient = make_patient(followed_by=[alice])

    response = client.patch(detail_url(patient), {"gender": "female"}, format="json")

    assert response.status_code == 405
    assert outcome_codes(response) == [("not-supported", None)]


# --- Delete (archive) -------------------------------------------------------------


def test_deleting_my_own_patient_archives_it(client, alice, make_patient):
    patient = make_patient(followed_by=[alice])

    response = client.delete(detail_url(patient))

    assert response.status_code == 204
    patient.refresh_from_db()
    assert patient.active is False
    assert Patient.objects.filter(pk=patient.pk).exists()  # archived, never hard-deleted
    assert client.get(detail_url(patient)).status_code == 404
    assert client.get(LIST_URL).json()["total"] == 0


def test_deleting_a_shared_patient_only_unfollows_it(client, bob_client, alice, bob, make_patient):
    patient = make_patient(followed_by=[alice, bob])

    response = client.delete(detail_url(patient))

    assert response.status_code == 204
    patient.refresh_from_db()
    assert patient.active is True
    assert list(patient.practitioners.all()) == [bob]
    assert client.get(detail_url(patient)).status_code == 404  # gone for Alice...
    assert bob_client.get(detail_url(patient)).status_code == 200  # ...still there for Bob

    assert bob_client.delete(detail_url(patient)).status_code == 204  # last follower leaves
    patient.refresh_from_db()
    assert patient.active is False
