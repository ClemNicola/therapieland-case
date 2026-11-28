import logging

from django.contrib.auth import login as django_login
from django.contrib.auth import logout as django_logout
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle

from accounts.authentication import SessionAuthentication
from accounts.serializers import LoginSerializer, UserSerializer

logger = logging.getLogger(__name__)


class LoginRateThrottle(SimpleRateThrottle):
    """Limits login attempts per client IP (rate: REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"])."""

    scope = "login"

    def get_cache_key(self, request, view) -> str:
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


@extend_schema(operation_id="getCsrfToken", responses={204: None})
@ensure_csrf_cookie
@api_view(["GET"])
@permission_classes([AllowAny])
def csrf(request: Request) -> Response:
    """Sets the `csrftoken` cookie, to send back as the `X-CSRFToken` header on unsafe requests."""
    return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(
    operation_id="login",
    request=LoginSerializer,
    responses={
        200: UserSerializer,
        400: OpenApiResponse(description="Invalid email or password (one generic error)."),
        429: OpenApiResponse(description="Too many login attempts from this IP."),
    },
)
@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([LoginRateThrottle])
def login(request: Request) -> Response:
    """Starts a session for the practitioner (session cookie)."""
    # DRF only enforces CSRF for authenticated requests. Login must be protected too,
    # otherwise an attacker can silently log a victim into the attacker's account.
    SessionAuthentication().enforce_csrf(request)

    serializer = LoginSerializer(data=request.data, context={"request": request})
    if not serializer.is_valid():
        logger.warning("Login failed")  # never log the submitted email or password
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    user = serializer.validated_data["user"]
    django_login(request, user)  # rotates the session ID and the CSRF token
    logger.info("Login succeeded: user=%s", user.id)
    return Response(UserSerializer(user).data)


@extend_schema(operation_id="logout", request=None, responses={204: None})
@api_view(["POST"])
def logout(request: Request) -> Response:
    """Ends the session."""
    user_id = request.user.id
    django_logout(request)
    logger.info("Logout: user=%s", user_id)
    return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(operation_id="getMe", responses=UserSerializer)
@api_view(["GET"])
def me(request: Request) -> Response:
    """The logged-in practitioner."""
    return Response(UserSerializer(request.user).data)
