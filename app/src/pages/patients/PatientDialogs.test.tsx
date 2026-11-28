import { screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import {
  ALICE,
  empty,
  json,
  patientBundle,
  patientResource,
  renderApp,
  byTextContent,
  requestsTo,
  setScreen,
  stubApi,
} from '../../test-utils'

const LIST = 'GET /api/patients/'
const CREATE = 'POST /api/patients/'
const ADAM = patientResource({
  id: '7c1d2e3f-0000-4000-8000-000000000002',
  family: 'Abbott',
  given: 'Adam',
  gender: 'male',
  birthDate: '1975-06-02',
  phone: '+00 000 000 0002',
  email: 'adam.abbott@example.com',
})
const ADAM_URL = `/api/patients/${ADAM.id}/`
const JANE = patientResource({
  id: '0b0e6b4e-0000-4000-8000-000000000009',
  family: 'Doe',
  given: 'Jane',
  gender: 'female',
  birthDate: '1990-01-31',
  phone: '+00 000 000 0001',
})

async function renderPatients(routes: Parameters<typeof stubApi>[0] = {}) {
  const api = stubApi({
    'GET /api/auth/me/': json(ALICE),
    [LIST]: json(patientBundle(ADAM)),
    ...routes,
  })
  const app = renderApp('/patients')
  await screen.findByText('Adam Abbott')
  return { ...api, ...app }
}

function bodyOf(fetchMock: ReturnType<typeof stubApi>['fetchMock'], key: string) {
  const [[, init]] = requestsTo(fetchMock, key)
  return JSON.parse(init!.body as string)
}

async function fillNewPatient(user: Awaited<ReturnType<typeof renderPatients>>['user']) {
  await user.type(screen.getByLabelText('Family name'), 'Doe')
  await user.type(screen.getByLabelText('Given name'), 'Jane')
  await user.type(screen.getByLabelText('Date of birth'), '1990-01-31')
  await user.click(screen.getByRole('radio', { name: 'Female' }))
  await user.type(screen.getByLabelText(/Phone/), '+00 000 000 0001')
}

// --- Add -------------------------------------------------------------------------------

test('adds a patient as a FHIR resource and shows it in the list', async () => {
  const { user, fetchMock, routes } = await renderPatients({
    [CREATE]: () => {
      routes[LIST] = json(patientBundle(ADAM, JANE))
      return Response.json(JANE, { status: 201 })
    },
  })

  await user.click(screen.getByRole('button', { name: 'Add patient' }))
  const dialog = screen.getByRole('dialog', { name: 'Add patient' })
  await fillNewPatient(user)
  await user.click(within(dialog).getByRole('button', { name: 'Add patient' }))

  expect(await screen.findByText('Jane Doe')).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByText(byTextContent('Last change: Jane Doe added.'))).toBeInTheDocument()
  expect(bodyOf(fetchMock, CREATE)).toEqual({
    resourceType: 'Patient',
    name: [{ use: 'official', family: 'Doe', given: ['Jane'] }],
    telecom: [{ system: 'phone', value: '+00 000 000 0001' }],
    gender: 'female',
    birthDate: '1990-01-31',
  })
})

test('an invalid form is reported on its fields without calling the API', async () => {
  const { user, fetchMock } = await renderPatients()
  await user.click(screen.getByRole('button', { name: 'Add patient' }))
  const dialog = screen.getByRole('dialog', { name: 'Add patient' })

  await user.click(within(dialog).getByRole('button', { name: 'Add patient' }))

  expect(await within(dialog).findByText('Enter the family name.')).toBeInTheDocument()
  expect(within(dialog).getByText('Choose a gender.')).toBeInTheDocument()
  expect(screen.getByLabelText('Family name')).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByLabelText('Given name')).toHaveFocus() // first invalid field, in form order
  expect(requestsTo(fetchMock, CREATE)).toHaveLength(0)
})

test('server validation errors (400) are shown on the right field', async () => {
  const { user } = await renderPatients({
    [CREATE]: json(
      {
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'value',
            diagnostics: 'Invalid phone.',
            expression: ['Patient.telecom[0].value'],
          },
        ],
      },
      400,
    ),
  })
  await user.click(screen.getByRole('button', { name: 'Add patient' }))
  const dialog = screen.getByRole('dialog', { name: 'Add patient' })
  await fillNewPatient(user)

  await user.click(within(dialog).getByRole('button', { name: 'Add patient' }))

  expect(await within(dialog).findByText('Invalid phone.')).toBeInTheDocument()
  expect(screen.getByLabelText(/Phone/)).toHaveAccessibleDescription('Invalid phone.')
  expect(screen.getByRole('dialog')).toBeInTheDocument() // stays open, values kept
  expect(screen.getByLabelText('Family name')).toHaveValue('Doe')
})

test('a network error keeps the dialog open with a message', async () => {
  const { user } = await renderPatients({ [CREATE]: () => new TypeError('Failed to fetch') })
  await user.click(screen.getByRole('button', { name: 'Add patient' }))
  const dialog = screen.getByRole('dialog', { name: 'Add patient' })
  await fillNewPatient(user)

  await user.click(within(dialog).getByRole('button', { name: 'Add patient' }))

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'The patient could not be saved. Try again.',
  )
})

test('the empty list offers to add a first patient', async () => {
  stubApi({ 'GET /api/auth/me/': json(ALICE), [LIST]: json(patientBundle()) })
  const { user } = renderApp('/patients')
  await screen.findByText('No patients yet.')

  await user.click(screen.getAllByRole('button', { name: 'Add patient' })[0])

  expect(screen.getByRole('dialog', { name: 'Add patient' })).toBeInTheDocument()
})

// --- Edit ------------------------------------------------------------------------------

test('edits a patient: form filled in, the whole resource replaced (PUT)', async () => {
  const { user, fetchMock, routes } = await renderPatients({
    [`PUT ${ADAM_URL}`]: () => {
      const updated = { ...ADAM, name: [{ use: 'official', family: 'Abbot', given: ['Adam'] }] }
      routes[LIST] = json(patientBundle(updated))
      return Response.json(updated)
    },
  })

  await user.click(screen.getByRole('button', { name: 'Edit Adam Abbott' }))
  const dialog = screen.getByRole('dialog', { name: 'Edit Adam Abbott' })
  expect(screen.getByLabelText('Family name')).toHaveValue('Abbott')
  expect(screen.getByLabelText('Date of birth')).toHaveValue('1975-06-02')
  expect(screen.getByRole('radio', { name: 'Male' })).toBeChecked()
  expect(screen.getByLabelText(/Email/)).toHaveValue('adam.abbott@example.com')

  await user.clear(screen.getByLabelText('Family name'))
  await user.type(screen.getByLabelText('Family name'), 'Abbot')
  await user.clear(screen.getByLabelText(/Email/))
  await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

  expect(await screen.findByText('Adam Abbot')).toBeInTheDocument()
  expect(screen.getByText(byTextContent('Last change: Adam Abbot updated.'))).toBeInTheDocument()
  expect(bodyOf(fetchMock, `PUT ${ADAM_URL}`)).toEqual({
    resourceType: 'Patient',
    name: [{ use: 'official', family: 'Abbot', given: ['Adam'] }],
    telecom: [{ system: 'phone', value: '+00 000 000 0002' }], // email removed
    gender: 'male',
    birthDate: '1975-06-02',
  })
})

test('editing a patient that is no longer followed says so and refreshes the list', async () => {
  const { user, routes } = await renderPatients({
    [`PUT ${ADAM_URL}`]: () => {
      routes[LIST] = json(patientBundle())
      return Response.json(
        {
          resourceType: 'OperationOutcome',
          issue: [{ severity: 'error', code: 'not-found', diagnostics: 'Patient not found.' }],
        },
        { status: 404 },
      )
    },
  })
  await user.click(screen.getByRole('button', { name: 'Edit Adam Abbott' }))

  await user.click(screen.getByRole('button', { name: 'Save changes' }))

  expect(await screen.findByText('This patient is no longer in your list.')).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(await screen.findByText('No patients yet.')).toBeInTheDocument()
})

test('Cancel closes the dialog without saving', async () => {
  const { user, fetchMock } = await renderPatients()
  await user.click(screen.getByRole('button', { name: 'Edit Adam Abbott' }))

  await user.click(screen.getByRole('button', { name: 'Cancel' }))

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(requestsTo(fetchMock, `PUT ${ADAM_URL}`)).toHaveLength(0)
  expect(screen.getByRole('button', { name: 'Edit Adam Abbott' })).toHaveFocus()
})

// --- Stop following ----------------------------------------------------------------------

test('stopping to follow a patient asks first, then removes them from the list', async () => {
  const { user, fetchMock, routes } = await renderPatients({
    [`DELETE ${ADAM_URL}`]: () => {
      routes[LIST] = json(patientBundle())
      return new Response(null, { status: 204 })
    },
  })

  await user.click(screen.getByRole('button', { name: 'Stop following Adam Abbott' }))
  const dialog = screen.getByRole('dialog', { name: 'Stop following Adam Abbott?' })
  expect(dialog).toHaveTextContent('archived')
  await user.click(within(dialog).getByRole('button', { name: 'Stop following' }))

  expect(await screen.findByText(byTextContent('Last change: You no longer follow Adam Abbott.'))).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(await screen.findByText('No patients yet.')).toBeInTheDocument()
  expect(requestsTo(fetchMock, `DELETE ${ADAM_URL}`)).toHaveLength(1)
  // The button that opened the dialog left with its row: focus goes to the page heading.
  expect(screen.getByRole('heading', { name: 'Patients', level: 1 })).toHaveFocus()
})

test('cancelling keeps the patient', async () => {
  const { user, fetchMock } = await renderPatients()
  await user.click(screen.getByRole('button', { name: 'Stop following Adam Abbott' }))

  await user.click(screen.getByRole('button', { name: 'Cancel' }))

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(requestsTo(fetchMock, `DELETE ${ADAM_URL}`)).toHaveLength(0)
  expect(screen.getByText('Adam Abbott')).toBeInTheDocument()
})

test('a failed request keeps the confirmation open with a message', async () => {
  const { user } = await renderPatients({ [`DELETE ${ADAM_URL}`]: empty(500) })
  await user.click(screen.getByRole('button', { name: 'Stop following Adam Abbott' }))

  await user.click(screen.getByRole('button', { name: 'Stop following' }))

  expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(
    "Couldn't stop following this patient. Try again.",
  )
})

// --- Mobile ----------------------------------------------------------------------------------

test('the cards have the same actions', async () => {
  setScreen('mobile')
  const { user } = await renderPatients()
  const card = within(screen.getByRole('list', { name: 'Patients' })).getByRole('listitem')

  await user.click(within(card).getByRole('button', { name: 'Edit Adam Abbott' }))

  expect(screen.getByRole('dialog', { name: 'Edit Adam Abbott' })).toBeInTheDocument()
})
