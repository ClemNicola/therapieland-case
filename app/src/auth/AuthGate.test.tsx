import { screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { ALICE, json, renderApp, stubApi, unauthenticated } from '../test-utils'

test('shows a loading status while checking the session', async () => {
  stubApi({ 'GET /api/auth/me/': () => new Promise<Response>(() => {}) })

  renderApp()

  expect(await screen.findByRole('status')).toHaveTextContent('Loading…')
})

test('shows the login form when there is no session', async () => {
  stubApi({ 'GET /api/auth/me/': unauthenticated })

  renderApp()

  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument()
})

test('shows the app with the practitioner when the session is valid', async () => {
  stubApi({ 'GET /api/auth/me/': json(ALICE) })

  renderApp()

  expect(await screen.findByText('Alice Martin')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument()
})

test.each([
  ['a server error', json({ detail: 'Server error.' }, 500)],
  ['a network error', () => new TypeError('Failed to fetch')],
])('on %s, offers to try again instead of the login form', async (_case, reply) => {
  const { routes } = stubApi({ 'GET /api/auth/me/': reply })
  const { user } = renderApp()

  expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't reach the server.")
  expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument()

  routes['GET /api/auth/me/'] = json(ALICE)
  await user.click(screen.getByRole('button', { name: 'Try again' }))

  expect(await screen.findByText('Alice Martin')).toBeInTheDocument()
})

test('an expired session sends back to the login form', async () => {
  const { routes } = stubApi({ 'GET /api/auth/me/': json(ALICE) })
  const { queryClient } = renderApp()
  await screen.findByText('Alice Martin')

  routes['GET /api/auth/me/'] = unauthenticated // idle timeout reached on the server
  await queryClient.refetchQueries() // e.g. the window regains focus

  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  expect(screen.queryByText('Alice Martin')).not.toBeInTheDocument()
})
