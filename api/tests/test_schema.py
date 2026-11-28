from pathlib import Path

from django.conf import settings
from django.core.management import call_command

COMMITTED_SCHEMA = Path(settings.BASE_DIR) / "openapi.yaml"


def test_schema_is_served(client):
    response = client.get("/api/schema/", HTTP_ACCEPT="application/vnd.oai.openapi+json")

    assert response.status_code == 200
    assert response.json()["openapi"].startswith("3.")


def test_swagger_ui_is_served(client):
    assert client.get("/api/docs/").status_code == 200


def test_swagger_ui_sends_the_current_csrf_token(client):
    """Login rotates the CSRF token: Swagger UI must read the cookie at request time,
    not use a token baked into its script when the page loaded."""
    script = client.get("/api/docs/", {"script": ""}).content.decode()

    assert "document.cookie" in script
    assert f"{settings.CSRF_COOKIE_NAME}=" in script
    assert '"X-CSRFToken"' in script


def test_committed_schema_is_up_to_date(tmp_path):
    """openapi.yaml drives the frontend codegen: it must match the code. Fix: `make schema`."""
    generated = tmp_path / "openapi.yaml"
    call_command("spectacular", "--file", str(generated), "--fail-on-warn")

    assert COMMITTED_SCHEMA.read_text() == generated.read_text()


def test_patient_list_is_one_bundle_not_an_array(client):
    """GET /api/patients/ returns one FHIR Bundle: the schema must not wrap it in an array."""
    schema = client.get("/api/schema/", HTTP_ACCEPT="application/vnd.oai.openapi+json").json()
    content = schema["paths"]["/api/patients/"]["get"]["responses"]["200"]["content"]

    for media_type in content.values():
        assert media_type["schema"] == {"$ref": "#/components/schemas/PatientBundle"}
