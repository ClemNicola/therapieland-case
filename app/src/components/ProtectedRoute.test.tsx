import { screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { ALICE, json, renderApp, stubApi, unauthenticated } from '../test-utils'

test('shows a loading status while checking the session', async () => {
  stubApi({ 'GET /api/auth/me/': () => new Promise<Response>(() => {}) })

  renderApp('/patients')

  expect(await screen.findByRole('status')).toHaveTextContent('Loading…')
})

test('redirects to /login when there is no session', async () => {
  stubApi({ 'GET /api/auth/me/': unauthenticated })

  const { location } = renderApp('/patients')

  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  expect(location()).toBe('/login')
})

test('shows the page and the practitioner when the session is valid', async () => {
  stubApi({ 'GET /api/auth/me/': json(ALICE) })

  const { location } = renderApp('/patients')

  expect(await screen.findByRole('heading', { name: 'Patients' })).toBeInTheDocument()
  expect(screen.getByText('Alice Martin')).toBeInTheDocument()
  expect(location()).toBe('/patients')
})

test.each(['/', '/unknown'])('%s redirects to /patients', async (path) => {
  stubApi({ 'GET /api/auth/me/': json(ALICE) })

  const { location } = renderApp(path)

  expect(await screen.findByRole('heading', { name: 'Patients' })).toBeInTheDocument()
  expect(location()).toBe('/patients')
})

test.each([
  ['a server error', json({ detail: 'Server error.' }, 500)],
  ['a network error', () => new TypeError('Failed to fetch')],
])('on %s, offers to try again instead of redirecting', async (_case, reply) => {
  const { routes } = stubApi({ 'GET /api/auth/me/': reply })
  const { user, location } = renderApp('/patients')

  expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't reach the server.")
  expect(location()).toBe('/patients')

  routes['GET /api/auth/me/'] = json(ALICE)
  await user.click(screen.getByRole('button', { name: 'Try again' }))

  expect(await screen.findByText('Alice Martin')).toBeInTheDocument()
})

test('an expired session redirects to /login', async () => {
  const { routes } = stubApi({ 'GET /api/auth/me/': json(ALICE) })
  const { queryClient, location } = renderApp('/patients')
  await screen.findByText('Alice Martin')

  routes['GET /api/auth/me/'] = unauthenticated // idle timeout reached on the server
  await queryClient.refetchQueries() // e.g. the window regains focus

  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  expect(location()).toBe('/login')
  expect(screen.queryByText('Alice Martin')).not.toBeInTheDocument()
})
