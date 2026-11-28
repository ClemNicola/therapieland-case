// The only place that knows the FHIR Patient shape on the frontend: the rest of the app
// works with flat rows. FHIR R4: one official name, phone/email found by telecom `system`.

import type { GenderEnum, Patient, PatientBundle } from '../api/generated/model'

export type PatientRow = {
  id: string
  family: string
  given: string
  gender: GenderEnum
  birthDate: string // FHIR date, YYYY-MM-DD
  phone: string
  email: string
}

export const GENDER_LABELS: Record<GenderEnum, string> = {
  female: 'Female',
  male: 'Male',
  other: 'Other',
  unknown: 'Unknown',
}

export function patientToRow(patient: Patient): PatientRow {
  const name = patient.name.find((n) => (n.use ?? 'official') === 'official') ?? patient.name[0]
  const contact = (system: 'phone' | 'email') =>
    patient.telecom?.find((point) => point.system === system)?.value ?? ''
  return {
    id: patient.id,
    family: name?.family ?? '',
    given: name?.given[0] ?? '',
    gender: patient.gender,
    birthDate: patient.birthDate,
    phone: contact('phone'),
    email: contact('email'),
  }
}

export function bundleToRows(bundle: PatientBundle): PatientRow[] {
  return (bundle.entry ?? []).map((entry) => patientToRow(entry.resource))
}

export function fullName(row: Pick<PatientRow, 'given' | 'family'>) {
  return `${row.given} ${row.family}`
}

export function shortId(id: string) {
  return id.slice(0, 8)
}

// A FHIR date is a calendar date: build it in local time. `new Date('1980-05-17')` would be
// UTC midnight, shown as the 16th west of Greenwich.
function localDate(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function formatBirthDate(date: string, locale?: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(localDate(date))
}

export function ageOn(birthDate: string, today: Date) {
  const birth = localDate(birthDate)
  const hadBirthday =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate())
  return today.getFullYear() - birth.getFullYear() - (hadBirthday ? 0 : 1)
}

export function normalizeForSearch(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Every word of the query must appear in the patient's name or id, in any order. */
export function patientMatches(row: PatientRow, query: string) {
  const haystack = normalizeForSearch(`${row.given} ${row.family} ${row.id}`)
  return normalizeForSearch(query)
    .split(' ')
    .every((word) => haystack.includes(word))
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base' })

/** Family name, then given name: locale-aware, accents sort with their base letter. */
export function compareByName(a: PatientRow, b: PatientRow) {
  return collator.compare(a.family, b.family) || collator.compare(a.given, b.given)
}
