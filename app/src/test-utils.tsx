import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { createQueryClient } from './api/queryClient'
import App from './App'

// Fake data only.
export const ALICE = {
  id: '0b0e6b4e-0000-4000-8000-00000000a11c',
  email: 'alice@example.com',
  first_name: 'Alice',
  last_name: 'Martin',
}

type Reply = Response | Error | (() => Response | Error | Promise<Response | Error>)

/**
 * Stubs fetch with routes keyed by "METHOD /path/". Replies are re-created per call
 * (a Response body can only be read once). Change `routes` mid-test to change answers.
 * An unexpected request fails the test.
 */
export function stubApi(initial: Record<string, Reply>) {
  const routes: Record<string, Reply> = {
    'GET /api/auth/csrf/': () => {
      document.cookie = 'csrftoken=test-csrf-token; path=/'
      return new Response(null, { status: 204 })
    },
    ...initial,
  }
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const key = `${(init.method ?? 'GET').toUpperCase()} ${url}`
    const reply = routes[key]
    if (!reply) throw new Error(`Unexpected request: ${key}`)
    const value = typeof reply === 'function' ? await reply() : reply
    if (value instanceof Error) throw value
    return value.clone()
  })
  vi.stubGlobal('fetch', fetchMock)
  return { routes, fetchMock }
}

export const json = (body: unknown, status = 200) => () => Response.json(body, { status })
export const empty = (status: number) => () => new Response(null, { status })
export const unauthenticated = json({ detail: 'Authentication credentials were not provided.' }, 401)

export function renderApp() {
  // No retry delay in tests: errors show up immediately.
  const queryClient = createQueryClient({ retryDelay: 0 })
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  )
  return { queryClient, user }
}

export function requestsTo(fetchMock: ReturnType<typeof stubApi>['fetchMock'], key: string) {
  return fetchMock.mock.calls.filter(
    ([url, init]) => `${(init?.method ?? 'GET').toUpperCase()} ${url}` === key,
  )
}
