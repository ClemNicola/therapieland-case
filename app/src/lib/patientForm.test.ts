import { expect, test } from 'vitest'
import type { PatientRow } from './patientFhir'
import {
  EMPTY_PATIENT_FORM,
  formToResource,
  issuesToFormErrors,
  patientFormSchema,
  rowToForm,
  type PatientFormData,
  type PatientFormValues,
} from './patientForm'

const VALID: PatientFormData = {
  family: 'Doe',
  given: 'Jane',
  birthDate: '1990-01-31',
  gender: 'female',
  phone: '+00 000 000 0001',
  email: 'jane.doe@example.com',
}

function errorsOf(values: Partial<Record<keyof PatientFormValues, string>>) {
  const result = patientFormSchema.safeParse({ ...VALID, ...values })
  if (result.success) return {}
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path[0], issue.message]))
}

// --- Validation: the same rules as the API (api/patients/fhir.py) ---------------------------

test('a complete form is valid, and contact details are optional', () => {
  expect(patientFormSchema.safeParse(VALID).success).toBe(true)
  expect(patientFormSchema.safeParse({ ...VALID, phone: '', email: '' }).success).toBe(true)
})

test.each([
  [{ family: '' }, { family: 'Enter the family name.' }],
  [{ family: '   ' }, { family: 'Enter the family name.' }],
  [{ given: '' }, { given: 'Enter the given name.' }],
  [{ family: 'S'.repeat(151) }, { family: 'Use at most 150 characters.' }],
  [{ family: 'Smith\u0000' }, { family: 'Remove the special characters.' }],
  [{ given: 'Jo\nhn' }, { given: 'Remove the special characters.' }],
  [{ birthDate: '' }, { birthDate: 'Enter the date of birth.' }],
  [{ birthDate: '1980' }, { birthDate: 'Enter a full date.' }],
  [{ birthDate: '1980-02-30' }, { birthDate: 'Enter a full date.' }],
  [{ birthDate: '2999-01-01' }, { birthDate: 'The date of birth cannot be in the future.' }],
  [{ gender: '' }, { gender: 'Choose a gender.' }],
  [{ phone: 'call me maybe' }, { phone: 'Enter a valid phone number.' }],
  [{ phone: '1'.repeat(33) }, { phone: 'Enter a valid phone number.' }],
  [{ email: 'not-an-email' }, { email: 'Enter a valid email address.' }],
])('rejects %j', (values, expected) => {
  expect(errorsOf(values)).toEqual(expected)
})

test('trims the names and contact details', () => {
  const parsed = patientFormSchema.parse({ ...VALID, family: '  Doe ', phone: ' +00 1 ' })

  expect(parsed.family).toBe('Doe')
  expect(parsed.phone).toBe('+00 1')
})

// --- Form <-> FHIR -----------------------------------------------------------------------

test('builds a FHIR Patient resource from the form', () => {
  expect(formToResource(VALID)).toEqual({
    resourceType: 'Patient',
    name: [{ use: 'official', family: 'Doe', given: ['Jane'] }],
    telecom: [
      { system: 'phone', value: '+00 000 000 0001' },
      { system: 'email', value: 'jane.doe@example.com' },
    ],
    gender: 'female',
    birthDate: '1990-01-31',
  })
})

test('leaves out empty contact details (PUT replaces the resource: they get removed)', () => {
  expect(formToResource({ ...VALID, phone: '' }).telecom).toEqual([
    { system: 'email', value: 'jane.doe@example.com' },
  ])
  expect(formToResource({ ...VALID, phone: '', email: '' })).not.toHaveProperty('telecom')
})

test('fills the form from a patient, and starts empty for a new one', () => {
  const row: PatientRow = { id: '0b0e6b4e-0000-4000-8000-000000000001', ...VALID }

  expect(rowToForm(row)).toEqual(VALID)
  expect(EMPTY_PATIENT_FORM).toEqual({
    family: '',
    given: '',
    birthDate: '',
    gender: '',
    phone: '',
    email: '',
  })
})

// --- Server errors (FHIR OperationOutcome) -> form fields ------------------------------------

function outcome(...issues: { code: string; diagnostics: string; expression?: string }[]) {
  return {
    resourceType: 'OperationOutcome',
    issue: issues.map(({ expression, ...issue }) => ({
      severity: 'error',
      ...issue,
      ...(expression ? { expression: [expression] } : {}),
    })),
  }
}

test('maps each issue to the field it is about', () => {
  const sent = formToResource(VALID)

  expect(
    issuesToFormErrors(
      outcome(
        { code: 'value', diagnostics: 'Invalid value.', expression: 'Patient.name[0].family' },
        { code: 'required', diagnostics: 'Required.', expression: 'Patient.name[0].given' },
        { code: 'value', diagnostics: 'Bad date.', expression: 'Patient.birthDate' },
        { code: 'value', diagnostics: 'Bad gender.', expression: 'Patient.gender' },
      ),
      sent,
    ),
  ).toEqual({
    fields: {
      family: 'Invalid value.',
      given: 'Required.',
      birthDate: 'Bad date.',
      gender: 'Bad gender.',
    },
    form: [],
  })
})

test('maps telecom issues to phone or email by what was sent at that index', () => {
  const emailOnly = formToResource({ ...VALID, phone: '' }) // email is telecom[0]

  expect(
    issuesToFormErrors(
      outcome({ code: 'value', diagnostics: 'Invalid email.', expression: 'Patient.telecom[0].value' }),
      emailOnly,
    ).fields,
  ).toEqual({ email: 'Invalid email.' })
})

test('issues without a known field are form-level errors', () => {
  expect(
    issuesToFormErrors(
      outcome(
        { code: 'structure', diagnostics: 'Unknown element.', expression: 'Patient' },
        { code: 'invalid', diagnostics: 'Invalid request.' },
      ),
      formToResource(VALID),
    ),
  ).toEqual({ fields: {}, form: ['Unknown element.', 'Invalid request.'] })
})

test('a body that is not an OperationOutcome gives a generic form error', () => {
  expect(issuesToFormErrors({ detail: 'oops' }, formToResource(VALID))).toEqual({
    fields: {},
    form: ['The patient could not be saved. Check the form and try again.'],
  })
})
