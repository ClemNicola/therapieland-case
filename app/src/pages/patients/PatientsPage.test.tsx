import { screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import {
  ALICE,
  json,
  patientBundle,
  patientResource,
  renderApp,
  requestsTo,
  setScreen,
  stubApi,
} from '../../test-utils'

const LIST = 'GET /api/patients/'

const ZOE = patientResource({
  id: '0b0e6b4e-0000-4000-8000-000000000001',
  family: 'Zimmer',
  given: 'Zoë',
  gender: 'female',
  birthDate: '1990-01-31',
  phone: '+00 000 000 0001',
})
const ADAM = patientResource({
  id: '7c1d2e3f-0000-4000-8000-000000000002',
  family: 'Abbott',
  given: 'Adam',
  gender: 'male',
  birthDate: '1975-06-02',
  email: 'adam.abbott@example.com',
})
const EMILE = patientResource({
  id: 'a9b8c7d6-0000-4000-8000-000000000003',
  family: 'Éluard',
  given: 'Émile',
  gender: 'other',
  birthDate: '2001-12-24',
})

function renderPatients(list: Parameters<typeof stubApi>[0][string]) {
  const api = stubApi({ 'GET /api/auth/me/': json(ALICE), [LIST]: list })
  return { ...api, ...renderApp('/patients') }
}

/** Patient names in display order: row headers in the table, card headings on mobile. */
function displayedNames() {
  const names = screen.queryByRole('table')
    ? screen.getAllByRole('rowheader')
    : within(screen.getByRole('list', { name: 'Patients' })).getAllByRole('heading')
  return names.map((element) => element.textContent)
}

// --- States -------------------------------------------------------------------------

test('shows a loading status while the patients load', async () => {
  renderPatients(() => new Promise<Response>(() => {}))

  expect(await screen.findByText('Loading patients…')).toHaveAttribute('role', 'status')
})

test('shows an error with a retry when the patients cannot be loaded', async () => {
  const { routes, user } = renderPatients(json({ detail: 'Server error.' }, 500))

  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your patients.")

  routes[LIST] = json(patientBundle(ADAM))
  await user.click(screen.getByRole('button', { name: 'Try again' }))

  expect(await screen.findByText('Adam Abbott')).toBeInTheDocument()
})

test('says so when the practitioner has no patients', async () => {
  renderPatients(json(patientBundle()))

  expect(await screen.findByText('No patients yet.')).toBeInTheDocument()
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
})

// --- List, sorting ----------------------------------------------------------------------

test('lists the patients sorted by family name, accents included', async () => {
  renderPatients(json(patientBundle(ZOE, ADAM, EMILE)))

  await screen.findByText('Adam Abbott')

  expect(displayedNames()).toEqual(['Adam Abbott', 'Émile Éluard', 'Zoë Zimmer'])
})

test('shows the details a practitioner needs on each row', async () => {
  renderPatients(json(patientBundle(ADAM)))

  const row = (await screen.findByText('Adam Abbott')).closest('tr')!

  expect(within(row).getByText('7c1d2e3f')).toBeInTheDocument() // short id
  expect(within(row).getByText(/1975/)).toBeInTheDocument() // birth date, in the browser's locale
  expect(within(row).getByText('Male')).toBeInTheDocument()
  expect(within(row).getByText('adam.abbott@example.com')).toBeInTheDocument()
})

test('the name column sorts both ways', async () => {
  const { user } = renderPatients(json(patientBundle(ZOE, ADAM, EMILE)))
  await screen.findByText('Adam Abbott')
  const header = screen.getByRole('columnheader', { name: /Name/ })
  expect(header).toHaveAttribute('aria-sort', 'ascending')

  await user.click(within(header).getByRole('button'))

  expect(header).toHaveAttribute('aria-sort', 'descending')
  expect(displayedNames()).toEqual(['Zoë Zimmer', 'Émile Éluard', 'Adam Abbott'])
})

// --- Search ---------------------------------------------------------------------------

test.each([
  ['a given name, ignoring accents and case', 'zoe', ['Zoë Zimmer']],
  ['a family name', 'ABBOTT', ['Adam Abbott']],
  ['several words in any order', 'eluard emile', ['Émile Éluard']],
  ['the start of the patient id', '7c1d2e3f', ['Adam Abbott']],
])('searches by %s', async (_case, query, expected) => {
  const { user } = renderPatients(json(patientBundle(ZOE, ADAM, EMILE)))
  await screen.findByText('Adam Abbott')

  await user.type(screen.getByRole('searchbox', { name: 'Search patients' }), query)

  expect(displayedNames()).toEqual(expected)
  expect(screen.getByText(`Showing ${expected.length} of 3 patients`)).toBeInTheDocument()
})

test('searching stays on the page: no request, nothing in the URL', async () => {
  const { user, fetchMock, location } = renderPatients(json(patientBundle(ZOE, ADAM)))
  await screen.findByText('Adam Abbott')
  const requestsBefore = fetchMock.mock.calls.length

  await user.type(screen.getByRole('searchbox', { name: 'Search patients' }), 'zoe')

  expect(fetchMock.mock.calls.length).toBe(requestsBefore)
  expect(requestsTo(fetchMock, LIST)).toHaveLength(1)
  expect(location()).toBe('/patients')
  expect(window.location.search).toBe('')
})

test('says so when no patient matches, and the search can be cleared', async () => {
  const { user } = renderPatients(json(patientBundle(ZOE, ADAM)))
  await screen.findByText('Adam Abbott')

  await user.type(screen.getByRole('searchbox', { name: 'Search patients' }), 'nobody')

  expect(screen.getByText('No patients match your search.')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Clear search' }))

  expect(screen.getByRole('searchbox', { name: 'Search patients' })).toHaveValue('')
  expect(displayedNames()).toEqual(['Adam Abbott', 'Zoë Zimmer'])
})

// --- Cards on mobile, table on larger screens --------------------------------------------

test('renders a table on larger screens', async () => {
  setScreen('desktop')
  renderPatients(json(patientBundle(ZOE, ADAM)))

  expect(await screen.findByRole('table', { name: 'Patients' })).toBeInTheDocument()
  expect(screen.queryByRole('list', { name: 'Patients' })).not.toBeInTheDocument()
})

test('renders cards on mobile, with the same sorting', async () => {
  setScreen('mobile')
  const { user } = renderPatients(json(patientBundle(ZOE, ADAM, EMILE)))

  const list = await screen.findByRole('list', { name: 'Patients' })
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  expect(within(list).getAllByRole('listitem')).toHaveLength(3)
  expect(displayedNames()).toEqual(['Adam Abbott', 'Émile Éluard', 'Zoë Zimmer'])

  await user.click(screen.getByRole('button', { name: 'Sort by name, Z to A' }))

  expect(displayedNames()).toEqual(['Zoë Zimmer', 'Émile Éluard', 'Adam Abbott'])
  expect(screen.getByRole('button', { name: 'Sort by name, A to Z' })).toBeInTheDocument()
})
