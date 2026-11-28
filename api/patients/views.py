import logging
import traceback
import uuid

from django.core.exceptions import RequestDataTooBig
from django.http import Http404
from django.urls import reverse
from drf_spectacular.openapi import AutoSchema
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import exceptions, status, viewsets
from rest_framework.renderers import JSONRenderer
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler
from rest_framework.views import set_rollback

from config.parsers import JSONParser
from patients.fhir import FhirInputError, Issue, operation_outcome, patient_bundle
from patients.models import Patient
from patients.selectors import patient_get, patient_list
from patients.serializers import (
    OperationOutcomeSerializer,
    PatientBundleSerializer,
    PatientSerializer,
)
from patients.services import patient_archive, patient_create, patient_update

logger = logging.getLogger(__name__)

FHIR_JSON = "application/fhir+json"


class FhirJSONRenderer(JSONRenderer):
    media_type = FHIR_JSON
    format = "fhir"


class FhirJSONParser(JSONParser):
    media_type = FHIR_JSON


# Fixed messages per error type: never derived from the request (no PHI echo).
ERROR_ISSUES: list[tuple[type[exceptions.APIException], Issue]] = [
    (exceptions.NotAuthenticated, Issue("login", "Authentication required.")),
    (exceptions.AuthenticationFailed, Issue("login", "Authentication required.")),
    (exceptions.NotFound, Issue("not-found", "Patient not found.")),
    (exceptions.MethodNotAllowed, Issue("not-supported", "Method not allowed.")),
    (exceptions.NotAcceptable, Issue("not-supported", "Response format not supported.")),
    (
        exceptions.UnsupportedMediaType,
        Issue("not-supported", f"Content-Type must be {FHIR_JSON} or application/json."),
    ),
    (exceptions.ParseError, Issue("structure", "The body is not valid JSON.")),
    (exceptions.Throttled, Issue("throttled", "Too many requests.")),
]


def fhir_exception_handler(exc: Exception, context: dict) -> Response | None:
    """Renders every API error of the patient endpoints as a FHIR OperationOutcome."""
    if isinstance(exc, FhirInputError):
        return Response(operation_outcome(exc.issues), status=status.HTTP_400_BAD_REQUEST)
    if isinstance(exc, Http404 | Patient.DoesNotExist):
        exc = exceptions.NotFound()
    if isinstance(exc, RequestDataTooBig):
        return Response(
            operation_outcome([Issue("too-costly", "The body is too large.")]),
            status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        )

    response = drf_exception_handler(exc, context)  # status + headers (WWW-Authenticate, Allow)
    if response is None:
        return _unexpected_error(exc, context)
    response.data = operation_outcome([_issue_for(exc)])
    return response


def _unexpected_error(exc: Exception, context: dict) -> Response:
    """A generic 500 OperationOutcome. The log keeps the exception type and stack trace for
    debugging, but not the message: library messages can quote values (PHI)."""
    stack = "".join(traceback.format_tb(exc.__traceback__))
    view = type(context["view"]).__name__
    logger.error("Unhandled %s in %s\n%s", type(exc).__name__, view, stack)
    set_rollback()
    return Response(
        operation_outcome([Issue("exception", "Internal server error.")]),
        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )


def _issue_for(exc: Exception) -> Issue:
    if isinstance(exc, exceptions.PermissionDenied):
        if "CSRF" in str(exc.detail):
            return Issue("forbidden", "CSRF token missing or invalid.")
        return Issue("forbidden", "Forbidden.")
    for exc_class, issue in ERROR_ISSUES:
        if isinstance(exc, exc_class):
            return issue
    return Issue("invalid", "Invalid request.")


PATIENT_ID = OpenApiParameter("id", OpenApiTypes.UUID, OpenApiParameter.PATH)

ERRORS = {
    401: OperationOutcomeSerializer,
    403: OperationOutcomeSerializer,
    404: OperationOutcomeSerializer,
}


class PatientSchema(AutoSchema):
    """drf-spectacular wraps every `list` action in a JSON array: ours returns one FHIR Bundle."""

    def _is_list_view(self, serializer=None) -> bool:
        return False


class PatientViewSet(viewsets.ViewSet):
    """Patients as FHIR R4 resources, scoped to the logged-in practitioner."""

    schema = PatientSchema()

    renderer_classes = [FhirJSONRenderer, JSONRenderer]
    parser_classes = [FhirJSONParser, JSONParser]

    def get_exception_handler(self):
        return fhir_exception_handler

    @extend_schema(operation_id="listPatients", responses={200: PatientBundleSerializer, **ERRORS})
    def list(self, request: Request) -> Response:
        """The practitioner's active patients, as a FHIR searchset Bundle (no pagination)."""
        patients = patient_list(user=request.user)
        bundle = patient_bundle(patients, full_url=lambda patient: self._url(request, patient))
        return Response(bundle)

    @extend_schema(
        operation_id="createPatient",
        request=PatientSerializer,
        responses={201: PatientSerializer, 400: OperationOutcomeSerializer, **ERRORS},
    )
    def create(self, request: Request) -> Response:
        """Creates a patient followed by the logged-in practitioner."""
        serializer = PatientSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        patient = patient_create(user=request.user, data=serializer.validated_data)
        return Response(
            PatientSerializer(patient).data,
            status=status.HTTP_201_CREATED,
            headers={"Location": self._url(request, patient)},
        )

    @extend_schema(
        operation_id="getPatient",
        parameters=[PATIENT_ID],
        responses={200: PatientSerializer, **ERRORS},
    )
    def retrieve(self, request: Request, pk: str) -> Response:
        return Response(PatientSerializer(self._get_patient(request, pk)).data)

    @extend_schema(
        operation_id="updatePatient",
        parameters=[PATIENT_ID],
        request=PatientSerializer,
        responses={200: PatientSerializer, 400: OperationOutcomeSerializer, **ERRORS},
    )
    def update(self, request: Request, pk: str) -> Response:
        """Replaces the patient (FHIR update). A body `id`, if any, must match the URL."""
        patient = self._get_patient(request, pk)
        serializer = PatientSerializer(data=request.data, context={"expected_id": str(patient.id)})
        serializer.is_valid(raise_exception=True)
        patient = patient_update(user=request.user, patient=patient, data=serializer.validated_data)
        return Response(PatientSerializer(patient).data)

    @extend_schema(
        operation_id="deletePatient", parameters=[PATIENT_ID], responses={204: None, **ERRORS}
    )
    def destroy(self, request: Request, pk: str) -> Response:
        """The practitioner stops following the patient; archived once nobody follows it."""
        patient_archive(patient=self._get_patient(request, pk), user=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _get_patient(self, request: Request, pk: str) -> Patient:
        # Malformed, unknown, archived or someone else's: the same 404 in every case.
        try:
            return patient_get(user=request.user, patient_id=uuid.UUID(pk))
        except ValueError, Patient.DoesNotExist:
            raise exceptions.NotFound() from None

    def _url(self, request: Request, patient: Patient) -> str:
        return request.build_absolute_uri(reverse("patients:patient-detail", args=[patient.id]))
