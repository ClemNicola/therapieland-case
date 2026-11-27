from django.db import DatabaseError, connection
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response


class HealthSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=["ok", "unavailable"])


@extend_schema(
    operation_id="getHealth",
    responses={200: HealthSerializer, 503: HealthSerializer},
)
@api_view(["GET"])
@permission_classes([AllowAny])
def health(request: Request) -> Response:
    """Liveness + database connectivity check. Public, returns no internal details."""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except DatabaseError:
        return Response({"status": "unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    return Response({"status": "ok"})
