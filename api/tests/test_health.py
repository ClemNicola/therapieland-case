import pytest
from django.db import OperationalError


@pytest.mark.django_db
def test_health_ok(client):
    response = client.get("/api/health/")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.django_db
def test_health_reports_unavailable_database_without_leaking_details(client, db_down):
    response = client.get("/api/health/")

    assert response.status_code == 503
    assert response.json() == {"status": "unavailable"}


@pytest.fixture
def db_down(monkeypatch):
    def broken_cursor(*args, **kwargs):
        raise OperationalError("connection refused to secret-host:5432")

    monkeypatch.setattr("config.views.connection.cursor", broken_cursor)
