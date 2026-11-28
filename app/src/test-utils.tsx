import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { vi } from 'vitest'
import { createQueryClient } from './api/queryClient'
import { routes } from './routes'

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
    // Signed-in pages load the patient list: by default, a practitioner without patients.
    'GET /api/patients/': () => Response.json(patientBundle()),
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

/** Renders the whole app (real routes and query client) at `path`, like main.tsx does. */
export function renderApp(path = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const queryClient = createQueryClient({
    onUnauthenticated: () => void router.navigate('/login', { replace: true }),
    // No retry delay in tests: errors show up immediately.
    queryDefaults: { retryDelay: 0 },
  })
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  const location = () => router.state.location.pathname
  return { queryClient, user, router, location }
}

export function requestsTo(fetchMock: ReturnType<typeof stubApi>['fetchMock'], key: string) {
  return fetchMock.mock.calls.filter(
    ([url, init]) => `${(init?.method ?? 'GET').toUpperCase()} ${url}` === key,
  )
}

// --- Patients (FHIR R4) -------------------------------------------------------------

type PatientFixture = {
  id: string
  family: string
  given: string
  gender?: 'male' | 'female' | 'other' | 'unknown'
  birthDate?: string
  phone?: string
  email?: string
}

/** A FHIR Patient resource as the API returns it (fake data only). */
export function patientResource({
  id,
  family,
  given,
  gender = 'female',
  birthDate = '1980-05-17',
  phone,
  email,
}: PatientFixture) {
  const telecom = [
    ...(phone ? [{ system: 'phone', value: phone }] : []),
    ...(email ? [{ system: 'email', value: email }] : []),
  ]
  return {
    resourceType: 'Patient',
    id,
    meta: { lastUpdated: '2026-01-01T00:00:00Z' },
    active: true,
    name: [{ use: 'official', family, given: [given] }],
    ...(telecom.length ? { telecom } : {}),
    gender,
    birthDate,
  }
}

/** A FHIR searchset Bundle, like GET /api/patients/. */
export function patientBundle(...patients: ReturnType<typeof patientResource>[]) {
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    total: patients.length,
    ...(patients.length
      ? {
          entry: patients.map((resource) => ({
            fullUrl: `http://localhost/api/patients/${resource.id}/`,
            resource,
          })),
        }
      : {}),
  }
}

/** Pretends the viewport is a phone or a larger screen (see useMediaQuery). */
export function setScreen(size: 'mobile' | 'desktop') {
  window.matchMedia = ((query: string) => ({
    matches: size === 'desktop' && query.includes('min-width'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}
