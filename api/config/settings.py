"""
Django settings for the patient management API.

All configuration comes from environment variables (12-factor). Defaults are the
*secure* choice: DEBUG is off and required secrets have no fallback, so a missing
variable fails at startup instead of silently running with an insecure value.
"""

import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from django.utils.csp import CSP

BASE_DIR = Path(__file__).resolve().parent.parent


def env(name: str, default: str | None = None) -> str:
    value = os.environ.get(name, default)
    if value is None:
        raise ImproperlyConfigured(f"Missing required environment variable: {name}")
    return value


def env_bool(name: str, default: bool = False) -> bool:
    return env(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in env(name, default).split(",") if item.strip()]


# --- Core ---------------------------------------------------------------------

SECRET_KEY = env("DJANGO_SECRET_KEY")
DEBUG = env_bool("DJANGO_DEBUG", default=False)
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS")

INSTALLED_APPS = [
    # auth + contenttypes are required by DRF (request.user) and by the upcoming auth step.
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "rest_framework",
    "drf_spectacular",
    "accounts",
    "patients",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.csp.ContentSecurityPolicyMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

# Only needed to render the Swagger UI page.
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "APP_DIRS": True,
    },
]

# --- Database -----------------------------------------------------------------

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("POSTGRES_DB"),
        "USER": env("POSTGRES_USER"),
        "PASSWORD": env("POSTGRES_PASSWORD"),
        "HOST": env("POSTGRES_HOST"),
        "PORT": env("POSTGRES_PORT", "5432"),
        "CONN_MAX_AGE": 60,
        "CONN_HEALTH_CHECKS": True,
        # Use "require" or "verify-full" when the database is not on a private network.
        "OPTIONS": {"sslmode": env("POSTGRES_SSLMODE", "prefer")},
    }
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- Authentication -----------------------------------------------------------

AUTH_USER_MODEL = "accounts.User"

# Argon2id: memory-hard, the OWASP-recommended password hash.
PASSWORD_HASHERS = ["django.contrib.auth.hashers.Argon2PasswordHasher"]

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 12},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# --- I18N ---------------------------------------------------------------------

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# --- Security -----------------------------------------------------------------
# Django already defaults to: X-Content-Type-Options nosniff, X-Frame-Options DENY,
# Referrer-Policy same-origin, Cross-Origin-Opener-Policy same-origin.

# Set when running behind a TLS-terminating reverse proxy that sets X-Forwarded-Proto.
if env_bool("DJANGO_BEHIND_TLS_PROXY", default=False):
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

SECURE_SSL_REDIRECT = env_bool("DJANGO_SECURE_SSL_REDIRECT", default=not DEBUG)
SECURE_HSTS_SECONDS = 0 if DEBUG else int(env("DJANGO_HSTS_SECONDS", "31536000"))
SECURE_HSTS_INCLUDE_SUBDOMAINS = not DEBUG
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG

# Strictest CSP: the API serves JSON only. Views rendering HTML (Swagger UI) override it.
SECURE_CSP = {
    "default-src": [CSP.NONE],
    "frame-ancestors": [CSP.NONE],
    "base-uri": [CSP.NONE],
    "form-action": [CSP.NONE],
}

# --- Logging ------------------------------------------------------------------
# Log to stdout (container-friendly). Never log request bodies: they will contain
# patient data (PHI).

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": env("DJANGO_LOG_LEVEL", "INFO")},
}

# --- Django REST Framework ----------------------------------------------------

REST_FRAMEWORK = {
    # Authentication is added in a later step. Until then nobody is authenticated...
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    # ...and everything is denied by default: public endpoints must opt out explicitly.
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    # JSON only: no browsable HTML API, no form/multipart parsing.
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}

# --- OpenAPI (drf-spectacular) ------------------------------------------------

SPECTACULAR_SETTINGS = {
    "TITLE": "Patient Management API",
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SERVE_PERMISSIONS": ["rest_framework.permissions.AllowAny"],
    # Separate request/response components (e.g. PatientRequest vs Patient), so the
    # generated TypeScript types don't mark read-only fields as writable.
    "COMPONENT_SPLIT_REQUEST": True,
    # Pin the Swagger UI assets (default is @latest from the CDN: a supply-chain risk).
    "SWAGGER_UI_DIST": "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.36.0",
    "SWAGGER_UI_FAVICON_HREF": "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.36.0/favicon-32x32.png",
}
