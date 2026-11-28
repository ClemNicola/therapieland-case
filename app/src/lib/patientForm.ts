// The patient form: validation (the API's rules, see api/patients/fhir.py), form <-> FHIR
// Patient resource, and server errors (OperationOutcome) mapped back to form fields.
//
// The generated Zod schema checks the FHIR structure, not these rules (OpenAPI can't express
// most of them): the server stays the authority, this gives immediate feedback.

import { z } from 'zod'
import type { PatientRequest } from '../api/generated/model'
import {
  CreatePatientBody,
  createPatientBodyNameItemFamilyMax as NAME_MAX,
} from '../api/generated/endpoints.zod'
import type { PatientRow } from './patientFhir'

const PHONE_MAX = 32 // Patient.phone max_length
const EMAIL_MAX = 254 // Django EmailField
const PHONE_PATTERN = /^\+?[0-9 ().-]+$/
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/ // NUL is rejected by PostgreSQL

const name = (missing: string) =>
  z
    .string()
    .trim()
    .min(1, missing)
    .max(NAME_MAX, `Use at most ${NAME_MAX} characters.`)
    .refine((value) => !CONTROL_CHARACTERS.test(value), 'Remove the special characters.')

function isFullDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

/** Today as a FHIR date (local calendar day, not UTC). */
export function todayIso() {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export const patientFormSchema = z.object({
  family: name('Enter the family name.'),
  given: name('Enter the given name.'),
  birthDate: z.string().superRefine((value, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message })
    if (!value) return fail('Enter the date of birth.')
    if (!isFullDate(value)) return fail('Enter a full date.')
    if (value > todayIso()) return fail('The date of birth cannot be in the future.')
  }),
  // '' = no radio chosen yet (the input type), the API's value set otherwise.
  gender: z
    .union([z.literal(''), z.enum(CreatePatientBody.shape.gender.options)])
    .pipe(z.enum(CreatePatientBody.shape.gender.options, { error: 'Choose a gender.' })),
  phone: z
    .string()
    .trim()
    .refine(
      (value) => !value || (value.length <= PHONE_MAX && PHONE_PATTERN.test(value)),
      'Enter a valid phone number.',
    ),
  email: z
    .string()
    .trim()
    .refine(
      (value) => !value || (value.length <= EMAIL_MAX && z.email().safeParse(value).success),
      'Enter a valid email address.',
    ),
})

/** What the inputs hold (no gender chosen yet = ''). */
export type PatientFormValues = z.input<typeof patientFormSchema>
/** What a valid form gives. */
export type PatientFormData = z.output<typeof patientFormSchema>
export type PatientField = keyof PatientFormValues

export const EMPTY_PATIENT_FORM: PatientFormValues = {
  family: '',
  given: '',
  birthDate: '',
  gender: '',
  phone: '',
  email: '',
}

export function rowToForm(row: PatientRow): PatientFormValues {
  const { family, given, birthDate, gender, phone, email } = row
  return { family, given, birthDate, gender, phone, email }
}

/**
 * The complete FHIR Patient resource for POST/PUT. PUT replaces the whole resource, so an
 * empty phone or email is left out and therefore removed. Server-managed elements (id,
 * meta, active) are never sent.
 */
export function formToResource(data: PatientFormData): PatientRequest {
  const telecom = [
    ...(data.phone ? [{ system: 'phone' as const, value: data.phone }] : []),
    ...(data.email ? [{ system: 'email' as const, value: data.email }] : []),
  ]
  return {
    resourceType: 'Patient',
    name: [{ use: 'official', family: data.family, given: [data.given] }],
    ...(telecom.length ? { telecom } : {}),
    gender: data.gender,
    birthDate: data.birthDate,
  }
}

const FIELD_BY_EXPRESSION: Record<string, PatientField> = {
  'Patient.name[0].family': 'family',
  'Patient.name[0].given': 'given',
  'Patient.name[0].given[0]': 'given',
  'Patient.birthDate': 'birthDate',
  'Patient.gender': 'gender',
}

type OutcomeIssue = { diagnostics?: string; expression?: string[] }

function isOperationOutcome(body: unknown): body is { issue: OutcomeIssue[] } {
  const candidate = body as { resourceType?: unknown; issue?: unknown } | null
  return candidate?.resourceType === 'OperationOutcome' && Array.isArray(candidate.issue)
}

/** Server 400 issues → field errors (by FHIR element path) and form-level errors. */
export function issuesToFormErrors(body: unknown, sent: PatientRequest) {
  const fields: Partial<Record<PatientField, string>> = {}
  const form: string[] = []
  if (!isOperationOutcome(body)) {
    return { fields, form: ['The patient could not be saved. Check the form and try again.'] }
  }
  for (const issue of body.issue) {
    const message = issue.diagnostics ?? 'Invalid value.'
    const expression = issue.expression?.[0] ?? ''
    const telecomIndex = /^Patient\.telecom\[(\d+)\]/.exec(expression)?.[1]
    // Telecom paths are positional: look up which system we sent at that index.
    const field =
      FIELD_BY_EXPRESSION[expression] ??
      (telecomIndex !== undefined ? sent.telecom?.[Number(telecomIndex)]?.system : undefined)
    if (field && !fields[field]) fields[field] = message
    else if (!field) form.push(message)
  }
  return { fields, form }
}
