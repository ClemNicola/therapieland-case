"""Guards against accidental weakening of the security baseline."""

import pytest
from django.conf import settings
from django.urls import get_resolver
from rest_framework.permissions import AllowAny

# Endpoints intentionally reachable without authentication. Adding one is a security
# decision: it must be added here explicitly.
PUBLIC_ENDPOINTS = {"/api/health/", "/api/schema/", "/api/docs/"}


def test_endpoints_are_private_by_default():
    assert settings.REST_FRAMEWORK["DEFAULT_PERMISSION_CLASSES"] == [
        "rest_framework.permissions.IsAuthenticated"
    ]


def test_only_allowlisted_endpoints_are_public():
    public = set()
    for pattern in get_resolver().url_patterns:
        view_cls = getattr(pattern.callback, "cls", None)
        permissions = getattr(view_cls, "permission_classes", [])
        if AllowAny in permissions:
            public.add(f"/{pattern.pattern}")

    assert public == PUBLIC_ENDPOINTS


@pytest.mark.django_db
def test_security_headers(client):
    response = client.get("/api/health/")

    assert response["X-Content-Type-Options"] == "nosniff"
    assert response["X-Frame-Options"] == "DENY"
    assert response["Referrer-Policy"] == "same-origin"
    assert "default-src 'none'" in response["Content-Security-Policy"]
    assert "frame-ancestors 'none'" in response["Content-Security-Policy"]


@pytest.mark.django_db
def test_api_renders_json_only(client):
    response = client.get("/api/health/", HTTP_ACCEPT="text/html")

    assert response.status_code == 406
