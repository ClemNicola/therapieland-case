import { screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import {
  ALICE,
  empty,
  json,
  renderApp,
  requestsTo,
  stubApi,
  unauthenticated,
} from '../test-utils'

const LOGOUT = 'POST /api/auth/logout/'

test('logging out ends the session, clears every cached data and goes to /login', async () => {
  const { routes, fetchMock } = stubApi({
    'GET /api/auth/me/': json(ALICE),
    [LOGOUT]: () => {
      routes['GET /api/auth/me/'] = unauthenticated // the server session is gone
      return new Response(null, { status: 204 })
    },
  })
  const { user, queryClient, location } = renderApp('/patients')
  await screen.findByText('Alice Martin')
  queryClient.setQueryData(['/api/patients/'], { data: 'fake patient' })

  await user.click(screen.getByRole('button', { name: 'Log out' }))

  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  expect(location()).toBe('/login')
  expect(requestsTo(fetchMock, LOGOUT)).toHaveLength(1)
  expect(requestsTo(fetchMock, LOGOUT)[0][1]?.credentials).toBe('include')
  const cached = queryClient.getQueryCache().getAll()
  expect(cached.every((query) => query.state.data === undefined)).toBe(true)
})

test('a logout that fails on the network keeps the user signed in', async () => {
  stubApi({
    'GET /api/auth/me/': json(ALICE),
    [LOGOUT]: () => new TypeError('Failed to fetch'),
  })
  const { user, location } = renderApp('/patients')
  await screen.findByText('Alice Martin')

  await user.click(screen.getByRole('button', { name: 'Log out' }))

  // The server session still exists: say so rather than pretend to be logged out.
  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't log out. Try again.")
  expect(screen.getByText('Alice Martin')).toBeInTheDocument()
  expect(location()).toBe('/patients')
})

test('a logout answering 401 (session already gone) goes to /login', async () => {
  const { routes } = stubApi({ 'GET /api/auth/me/': json(ALICE), [LOGOUT]: empty(401) })
  const { user, location } = renderApp('/patients')
  await screen.findByText('Alice Martin')
  routes['GET /api/auth/me/'] = unauthenticated

  await user.click(screen.getByRole('button', { name: 'Log out' }))

  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  expect(location()).toBe('/login')
})
