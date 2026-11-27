from drf_spectacular.authentication import SessionScheme
from rest_framework import authentication


class SessionAuthentication(authentication.SessionAuthentication):
    """DRF session auth, answering 401 instead of 403 to unauthenticated requests.

    DRF only returns 401 when the auth class provides a WWW-Authenticate value. The
    frontend relies on the distinction: 401 = log in again, 403 = not allowed.
    """

    def authenticate_header(self, request) -> str:
        return "Session"


class SessionAuthenticationScheme(SessionScheme):
    """Documents the class above as cookie auth in the OpenAPI schema."""

    target_class = SessionAuthentication
