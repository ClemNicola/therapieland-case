import { afterEach, expect, test, vi } from 'vitest'
import { patientResource } from '../test-utils'
import {
  ageOn,
  formatBirthDate,
  normalizeForSearch,
  patientMatches,
  patientToRow,
  type PatientRow,
} from './patientFhir'

const ID = '0b0e6b4e-1111-4000-8000-000000000001'

test('maps a FHIR Patient to a flat row', () => {
  const resource = patientResource({
    id: ID,
    family: 'Doe',
    given: 'Jane',
    gender: 'female',
    birthDate: '1990-01-31',
    phone: '+00 000 000 0001',
    email: 'jane.doe@example.com',
  })

  expect(patientToRow(resource as never)).toEqual({
    id: ID,
    family: 'Doe',
    given: 'Jane',
    gender: 'female',
    birthDate: '1990-01-31',
    phone: '+00 000 000 0001',
    email: 'jane.doe@example.com',
  })
})

test('finds phone and email by system, whatever their order, and defaults to empty', () => {
  const resource = {
    ...patientResource({ id: ID, family: 'Doe', given: 'Jane' }),
    telecom: [
      { system: 'email' as const, value: 'jane.doe@example.com' },
      { system: 'phone' as const, value: '+00 1' },
    ],
  }

  expect(patientToRow(resource as never)).toMatchObject({ phone: '+00 1', email: 'jane.doe@example.com' })
  expect(patientToRow(patientResource({ id: ID, family: 'Doe', given: 'Jane' }) as never)).toMatchObject({
    phone: '',
    email: '',
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

test('formats a birth date as a calendar date, without timezone shift', () => {
  vi.stubEnv('TZ', 'America/Los_Angeles') // UTC midnight would be the 16th here

  expect(formatBirthDate('1980-05-17', 'en-GB')).toBe('17 May 1980')
})

test('computes the age in full years', () => {
  expect(ageOn('1980-05-17', new Date(2026, 4, 16))).toBe(45) // the day before the birthday
  expect(ageOn('1980-05-17', new Date(2026, 4, 17))).toBe(46)
  expect(ageOn('2000-02-29', new Date(2026, 1, 28))).toBe(25)
})

test('normalizes text for search: case, accents and spaces', () => {
  expect(normalizeForSearch('  Zoë   ÉLISE ')).toBe('zoe elise')
})

const ZOE: PatientRow = {
  id: '0b0e6b4e-2222-4000-8000-000000000002',
  family: 'Dupré',
  given: 'Zoë',
  gender: 'female',
  birthDate: '1990-01-31',
  phone: '',
  email: '',
}

test.each([
  ['zoe', true],
  ['DUPRE', true],
  ['zoe dupre', true],
  ['dupre zoe', true], // every word must match, in any order
  ['zoe smith', false],
  ['0b0e6b4e-2222', true], // id
  ['', true],
  ['   ', true],
])('patientMatches(%j) is %s', (query, expected) => {
  expect(patientMatches(ZOE, query)).toBe(expected)
})
