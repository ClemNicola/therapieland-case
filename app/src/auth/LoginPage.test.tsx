import { screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import {
  ALICE,
  json,
  renderApp,
  requestsTo,
  stubApi,
  unauthenticated,
} from '../test-utils'

const LOGIN = 'POST /api/auth/login/'

async function renderLogin(routes: Parameters<typeof stubApi>[0] = {}) {
  const api = stubApi({ 'GET /api/auth/me/': unauthenticated, ...routes })
  const app = renderApp()
  await screen.findByRole('heading', { name: 'Sign in' })
  return { ...api, ...app }
}

async function signIn(
  user: ReturnType<typeof renderApp>['user'],
  email = 'alice@example.com',
  password = 'alice-local-dev-only',
) {
  if (email) await user.type(screen.getByLabelText('Email'), email)
  if (password) await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

test('the fields are labelled for password managers', async () => {
  await renderLogin()

  expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'username')
  expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
  expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password')
})

test('signing in shows the app', async () => {
  const { user, fetchMock } = await renderLogin({ [LOGIN]: json(ALICE) })

  await signIn(user)

  expect(await screen.findByText('Alice Martin')).toBeInTheDocument()
  const [[, init]] = requestsTo(fetchMock, LOGIN)
  expect(JSON.parse(init!.body as string)).toEqual({
    email: 'alice@example.com',
    password: 'alice-local-dev-only',
  })
})

test('empty fields are reported without calling the API', async () => {
  const { user, fetchMock } = await renderLogin()

  await signIn(user, '', '')

  expect(await screen.findByText('Enter your email address.')).toBeInTheDocument()
  expect(screen.getByText('Enter your password.')).toBeInTheDocument()
  expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByLabelText('Email')).toHaveFocus()
  expect(requestsTo(fetchMock, LOGIN)).toHaveLength(0)
})

test('an invalid email is reported without calling the API', async () => {
  const { user, fetchMock } = await renderLogin()

  await signIn(user, 'not-an-email')

  expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
  expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Enter a valid email address.')
  expect(requestsTo(fetchMock, LOGIN)).toHaveLength(0)
})

test('wrong credentials show one generic error and clear the password', async () => {
  const { user } = await renderLogin({
    [LOGIN]: json({ non_field_errors: ['Invalid email or password.'] }, 400),
  })

  await signIn(user, 'alice@example.com', 'wrong-password')

  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.')
  expect(screen.getByLabelText('Password')).toHaveValue('')
  expect(screen.getByLabelText('Email')).toHaveValue('alice@example.com')
})

test('too many attempts show the rate-limit message', async () => {
  const { user } = await renderLogin({
    [LOGIN]: json({ detail: 'Request was throttled.' }, 429),
  })

  await signIn(user)

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Too many attempts. Wait a minute and try again.',
  )
})

test('a network error shows a generic message', async () => {
  const { user } = await renderLogin({ [LOGIN]: () => new TypeError('Failed to fetch') })

  await signIn(user)

  expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.')
})

test('the button is disabled while signing in', async () => {
  const { user } = await renderLogin({ [LOGIN]: () => new Promise<Response>(() => {}) })

  await signIn(user)

  expect(await screen.findByRole('button', { name: 'Signing in…' })).toBeDisabled()
})
