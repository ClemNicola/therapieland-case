"""Mapping between the Patient model and FHIR R4 Patient resources (via fhir.resources.R4B).

Input errors are reported as FHIR OperationOutcome issues. Their messages are fixed
strings and their expressions only contain known FHIR element names: submitted values
(potentially PHI) are never echoed back.
"""

import datetime
import re
import uuid
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from typing import Any

from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.utils import timezone
from fhir.resources.R4B.meta import Meta as FhirMeta
from fhir.resources.R4B.patient import Patient as FhirPatient
from pydantic import ValidationError as PydanticValidationError

from patients.models import Gender, Patient

NAME_MAX_LENGTH = Patient._meta.get_field("family_name").max_length
PHONE_MAX_LENGTH = Patient._meta.get_field("phone").max_length
EMAIL_MAX_LENGTH = Patient._meta.get_field("email").max_length
PHONE_PATTERN = re.compile(r"^\+?[0-9 ().-]+$")
FULL_DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
CONTROL_CHARACTERS = re.compile(r"[\x00-\x1f\x7f]")  # NUL is rejected by PostgreSQL
# The deepest supported element is Patient.name[0].given[0]. Anything much deeper is
# rejected before validation, which recurses (deep input → RecursionError → 500).
MAX_DEPTH = 10

# Every element name a FHIR R4 Patient may contain (JSON names).
FHIR_PATIENT_ELEMENTS = {"resourceType"} | {
    name for name in FhirPatient.model_fields if "__" not in name and name != "fhir_comments"
}
# The subset this server stores. id/meta/active are server-managed: accepted, ignored.
SUPPORTED_ELEMENTS = {
    "resourceType",
    "id",
    "meta",
    "active",
    "name",
    "telecom",
    "gender",
    "birthDate",
}
FHIR_META_ELEMENTS = {name for name in FhirMeta.model_fields if "__" not in name}
SUPPORTED_META_ELEMENTS = {"lastUpdated", "versionId"}  # server-managed: accepted, ignored
SUPPORTED_NAME_ELEMENTS = {"use", "family", "given"}
SUPPORTED_TELECOM_ELEMENTS = {"system", "value"}


@dataclass(frozen=True)
class Issue:
    code: str  # FHIR IssueType: structure, required, value, not-supported...
    diagnostics: str
    expression: str | None = None

    def to_fhir(self) -> dict[str, Any]:
        issue = {"severity": "error", "code": self.code, "diagnostics": self.diagnostics}
        if self.expression:
            issue["expression"] = [self.expression]
        return issue


class FhirInputError(Exception):
    def __init__(self, issues: list[Issue]):
        super().__init__(f"{len(issues)} FHIR input issue(s)")
        self.issues = issues


def operation_outcome(issues: Iterable[Issue]) -> dict[str, Any]:
    return {"resourceType": "OperationOutcome", "issue": [issue.to_fhir() for issue in issues]}


# --- Model -> FHIR ------------------------------------------------------------------


def patient_to_fhir(patient: Patient) -> dict[str, Any]:
    telecom = [
        {"system": system, "value": value}
        for system, value in (("phone", patient.phone), ("email", patient.email))
        if value
    ]
    resource = FhirPatient(
        id=str(patient.id),
        meta={"lastUpdated": patient.updated_at},
        active=patient.active,
        name=[{"use": "official", "family": patient.family_name, "given": [patient.given_name]}],
        telecom=telecom or None,
        gender=patient.gender,
        birthDate=patient.birth_date,
    )  # constructing the resource validates our own output against FHIR R4
    return resource.model_dump(mode="json", exclude_none=True)


def patient_bundle(
    patients: Iterable[Patient], *, full_url: Callable[[Patient], str]
) -> dict[str, Any]:
    entries = [{"fullUrl": full_url(p), "resource": patient_to_fhir(p)} for p in patients]
    bundle: dict[str, Any] = {"resourceType": "Bundle", "type": "searchset", "total": len(entries)}
    if entries:
        bundle["entry"] = entries
    return bundle


# --- FHIR -> model ------------------------------------------------------------------


def patient_from_fhir(data: Any, *, expected_id: str | None = None) -> dict[str, Any]:
    """Validates a FHIR Patient resource and returns the model fields it maps to.

    Raises FhirInputError with every issue found.
    """
    if not isinstance(data, dict):
        raise FhirInputError([Issue("structure", "The body must be a FHIR Patient resource.")])
    if _depth(data) > MAX_DEPTH:
        raise FhirInputError([Issue("structure", "The resource is nested too deeply.")])

    issues = _check_top_level(data, expected_id)
    # resourceType is checked above; validate the supported elements against FHIR R4.
    resource = {
        key: value
        for key, value in data.items()
        if key in SUPPORTED_ELEMENTS and key != "resourceType"
    }
    if isinstance(resource.get("meta"), dict):
        issues += _check_meta(resource["meta"])
        resource["meta"] = {
            key: value
            for key, value in resource["meta"].items()
            if key in SUPPORTED_META_ELEMENTS
        }
    invalid_elements = set()
    try:
        FhirPatient.model_validate(resource)
    except PydanticValidationError as error:
        for err in error.errors(include_input=False):
            issues.append(_issue_from_pydantic(err, resource))
            invalid_elements.add(err["loc"][0])

    # Our own rules, on every element FHIR validation accepted: all problems are
    # reported in one response.
    fields: dict[str, Any] = {}
    if "name" not in invalid_elements:
        fields |= _name_fields(resource.get("name"), issues)
    if "gender" not in invalid_elements:
        fields["gender"] = _gender(resource.get("gender"), issues)
    if "birthDate" not in invalid_elements:
        fields["birth_date"] = _birth_date(resource.get("birthDate"), issues)
    if "telecom" not in invalid_elements:
        fields |= _telecom_fields(resource.get("telecom") or [], issues)
    if issues:
        raise FhirInputError(issues)
    return fields


def _check_top_level(data: dict, expected_id: str | None) -> list[Issue]:
    issues = []
    if "resourceType" not in data:
        issues.append(Issue("required", "resourceType is required.", "Patient.resourceType"))
    elif data["resourceType"] != "Patient":
        issues.append(Issue("value", "resourceType must be 'Patient'.", "Patient.resourceType"))
    for key in data:
        if key not in FHIR_PATIENT_ELEMENTS:
            # Unknown key: don't echo it, it is client-controlled text.
            issues.append(Issue("structure", "Unknown element.", "Patient"))
        elif key not in SUPPORTED_ELEMENTS:
            issues.append(Issue("not-supported", "Element not supported.", f"Patient.{key}"))
    if expected_id is not None and "id" in data and not _same_uuid(data["id"], expected_id):
        issues.append(Issue("value", "id must match the id in the URL.", "Patient.id"))
    return issues


def _check_meta(meta: dict) -> list[Issue]:
    # Unsupported meta (security labels, tags...) is rejected, never silently dropped.
    issues = []
    for key in meta.keys() - SUPPORTED_META_ELEMENTS:
        if key in FHIR_META_ELEMENTS:
            issues.append(Issue("not-supported", "Element not supported.", f"Patient.meta.{key}"))
        else:
            issues.append(Issue("structure", "Unknown element.", "Patient.meta"))
    return issues


def _same_uuid(value: Any, expected: str) -> bool:
    try:
        return uuid.UUID(str(value)) == uuid.UUID(expected)
    except ValueError:
        return False


def _depth(data: Any) -> int:
    """Nesting depth of parsed JSON, computed without recursion."""
    deepest, stack = 0, [(data, 1)]
    while stack:
        value, depth = stack.pop()
        if isinstance(value, dict | list):
            deepest = max(deepest, depth)
            if depth > MAX_DEPTH:
                break
            children = value.values() if isinstance(value, dict) else value
            stack.extend((child, depth + 1) for child in children)
    return deepest


def _issue_from_pydantic(error: dict, resource: dict) -> Issue:
    location = list(error["loc"])
    if error["type"] == "extra_forbidden":
        # The last location item is the client's unknown key: don't echo it.
        return Issue("structure", "Unknown element.", _expression(location[:-1]))
    if error["type"] == "missing" or _value_at(resource, location) == "":
        # FHIR forbids empty strings: an empty value is a missing one.
        return Issue("required", "Required element is missing.", _expression(location))
    return Issue("value", "Invalid value.", _expression(location))


def _value_at(resource: Any, location: list) -> Any:
    for part in location:
        try:
            resource = resource[part]
        except KeyError, IndexError, TypeError:
            return None
    return resource


def _expression(location: list) -> str:
    path = "Patient"
    for part in location:
        path += f"[{part}]" if isinstance(part, int) else f".{part}"
    return path


def _name_fields(names: list | None, issues: list[Issue]) -> dict[str, str]:
    if not names:
        issues.append(Issue("required", "A name is required.", "Patient.name"))
        return {}
    if len(names) > 1:
        issues.append(Issue("not-supported", "Only one name is supported.", "Patient.name"))
        return {}

    name, path = names[0], "Patient.name[0]"
    for key in name.keys() - SUPPORTED_NAME_ELEMENTS:
        issues.append(Issue("not-supported", "Element not supported.", f"{path}.{key}"))
    if name.get("use", "official") != "official":
        issues.append(Issue("not-supported", "Only the official name is supported.", f"{path}.use"))

    family = _required_text(name.get("family"), f"{path}.family", issues)
    given_names = name.get("given") or []
    if not given_names:
        issues.append(Issue("required", "A given name is required.", f"{path}.given"))
        given = ""
    elif len(given_names) > 1:
        issues.append(Issue("not-supported", "Only one given name is supported.", f"{path}.given"))
        given = ""
    else:
        given = _required_text(given_names[0], f"{path}.given", issues)
    return {"family_name": family, "given_name": given}


def _required_text(value: str | None, expression: str, issues: list[Issue]) -> str:
    value = (value or "").strip()
    if not value:
        issues.append(Issue("required", "Required element is missing.", expression))
    elif CONTROL_CHARACTERS.search(value):
        issues.append(Issue("value", "Must not contain control characters.", expression))
    elif len(value) > NAME_MAX_LENGTH:
        issues.append(Issue("value", f"Must be at most {NAME_MAX_LENGTH} characters.", expression))
    return value


def _gender(gender: str | None, issues: list[Issue]) -> str:
    # fhir.resources doesn't enforce value sets: check the required binding ourselves.
    if gender is None:
        issues.append(Issue("required", "gender is required.", "Patient.gender"))
    elif gender not in Gender.values:
        allowed = ", ".join(Gender.values)
        issues.append(Issue("value", f"gender must be one of: {allowed}.", "Patient.gender"))
    return gender or ""


def _birth_date(birth_date: str | None, issues: list[Issue]) -> datetime.date | None:
    expression = "Patient.birthDate"
    if birth_date is None:
        issues.append(Issue("required", "birthDate is required.", expression))
        return None
    # FHIR allows partial dates (1980, 1980-05): this server needs a full date.
    if not FULL_DATE_PATTERN.match(birth_date):
        issues.append(Issue("value", "birthDate must be a full date (YYYY-MM-DD).", expression))
        return None
    parsed = datetime.date.fromisoformat(birth_date)
    if parsed > timezone.localdate():
        issues.append(Issue("value", "birthDate must not be in the future.", expression))
    return parsed


def _telecom_fields(telecom: list[dict], issues: list[Issue]) -> dict[str, str]:
    fields = {"phone": "", "email": ""}
    seen = set()
    for index, contact in enumerate(telecom):
        path = f"Patient.telecom[{index}]"
        for key in contact.keys() - SUPPORTED_TELECOM_ELEMENTS:
            issues.append(Issue("not-supported", "Element not supported.", f"{path}.{key}"))
        system, value = contact.get("system"), (contact.get("value") or "").strip()
        if system not in fields:
            issues.append(
                Issue("not-supported", "system must be 'phone' or 'email'.", f"{path}.system")
            )
            continue
        if system in seen:
            issues.append(Issue("not-supported", f"Only one {system} is supported.", path))
            continue
        seen.add(system)
        if not value:
            issues.append(Issue("required", "value is required.", f"{path}.value"))
        elif not _is_valid_contact(system, value):
            issues.append(Issue("value", f"Invalid {system}.", f"{path}.value"))
        else:
            fields[system] = value
    return fields


def _is_valid_contact(system: str, value: str) -> bool:
    if system == "phone":
        return len(value) <= PHONE_MAX_LENGTH and bool(PHONE_PATTERN.match(value))
    try:
        validate_email(value)
    except ValidationError:
        return False
    return len(value) <= EMAIL_MAX_LENGTH
