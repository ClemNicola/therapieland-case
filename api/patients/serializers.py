"""FHIR R4 shapes of the patient API.

The nested serializers describe the resources in the OpenAPI schema (and so in the
generated frontend types). Validation and mapping are delegated to patients.fhir.
"""

from typing import Any

from rest_framework import serializers

from patients.fhir import patient_from_fhir, patient_to_fhir
from patients.models import Gender, Patient


class HumanNameSerializer(serializers.Serializer):
    use = serializers.ChoiceField(choices=["official"], required=False)
    family = serializers.CharField(max_length=150)
    given = serializers.ListField(
        child=serializers.CharField(max_length=150), min_length=1, max_length=1
    )


class ContactPointSerializer(serializers.Serializer):
    system = serializers.ChoiceField(choices=["phone", "email"])
    value = serializers.CharField()


class MetaSerializer(serializers.Serializer):
    lastUpdated = serializers.DateTimeField(read_only=True)


class PatientSerializer(serializers.Serializer):
    resourceType = serializers.ChoiceField(choices=["Patient"])
    id = serializers.UUIDField(read_only=True)
    meta = MetaSerializer(read_only=True)
    active = serializers.BooleanField(read_only=True)
    name = HumanNameSerializer(many=True, min_length=1, max_length=1)
    telecom = ContactPointSerializer(many=True, required=False, max_length=2)
    gender = serializers.ChoiceField(choices=Gender.choices)
    birthDate = serializers.DateField()

    def to_internal_value(self, data: Any) -> dict[str, Any]:
        # Raises patients.fhir.FhirInputError, rendered as a 400 OperationOutcome by the view.
        return patient_from_fhir(data, expected_id=self.context.get("expected_id"))

    def to_representation(self, instance: Patient) -> dict[str, Any]:
        return patient_to_fhir(instance)


class BundleEntrySerializer(serializers.Serializer):
    fullUrl = serializers.URLField()
    resource = PatientSerializer()


class PatientBundleSerializer(serializers.Serializer):
    resourceType = serializers.ChoiceField(choices=["Bundle"])
    type = serializers.ChoiceField(choices=["searchset"])
    total = serializers.IntegerField()
    entry = BundleEntrySerializer(many=True, required=False)


class OperationOutcomeIssueSerializer(serializers.Serializer):
    severity = serializers.ChoiceField(choices=["error"])
    code = serializers.CharField()
    diagnostics = serializers.CharField()
    expression = serializers.ListField(child=serializers.CharField(), required=False)


class OperationOutcomeSerializer(serializers.Serializer):
    resourceType = serializers.ChoiceField(choices=["OperationOutcome"])
    issue = OperationOutcomeIssueSerializer(many=True)
