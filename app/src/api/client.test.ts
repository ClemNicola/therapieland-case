import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { ApiError, customFetch } from './client'

function setCsrfCookie(value: string) {
  document.cookie = `csrftoken=${value}; path=/`
}

function clearCsrfCookie() {
  document.cookie = 'csrftoken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
}

function stubFetch(...responses: Response[]) {
  const fetchMock = vi.fn()
  for (const response of responses) fetchMock.mockResolvedValueOnce(response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('Expected the request to fail')
}

function headersOf(call: unknown[]) {
  return new Headers((call[1] as RequestInit).headers)
}

beforeEach(() => setCsrfCookie('token-1'))
afterEach(clearCsrfCookie)

test('sends the session cookie and no CSRF header on safe requests', async () => {
  const fetchMock = stubFetch(Response.json({ status: 'ok' }))

  await customFetch('/api/health/', { method: 'GET' })

  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('/api/health/')
  expect(init.credentials).toBe('include')
  expect(headersOf(fetchMock.mock.calls[0]).has('X-CSRFToken')).toBe(false)
})

test.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
  'sends the CSRF cookie value as a header on %s',
  async (method) => {
    const fetchMock = stubFetch(new Response(null, { status: 204 }))

    await customFetch('/api/patients/', { method })

    expect(fetchMock.mock.calls[0][1].credentials).toBe('include')
    expect(headersOf(fetchMock.mock.calls[0]).get('X-CSRFToken')).toBe('token-1')
  },
)

test('reads the cookie on every request (login rotates the token)', async () => {
  const fetchMock = stubFetch(
    new Response(null, { status: 204 }),
    new Response(null, { status: 204 }),
  )

  await customFetch('/api/auth/login/', { method: 'POST' })
  setCsrfCookie('token-2')
  await customFetch('/api/patients/', { method: 'POST' })

  expect(headersOf(fetchMock.mock.calls[1]).get('X-CSRFToken')).toBe('token-2')
})

test('fetches the CSRF cookie first when it is missing', async () => {
  clearCsrfCookie()
  const fetchMock = vi
    .fn()
    .mockImplementationOnce(async () => {
      setCsrfCookie('fresh-token') // what the browser does with Set-Cookie
      return new Response(null, { status: 204 })
    })
    .mockResolvedValueOnce(Response.json({ id: 'x' }))
  vi.stubGlobal('fetch', fetchMock)

  await customFetch('/api/auth/login/', { method: 'POST' })

  expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/csrf/')
  expect(fetchMock.mock.calls[0][1].credentials).toBe('include')
  expect(headersOf(fetchMock.mock.calls[1]).get('X-CSRFToken')).toBe('fresh-token')
})

test('keeps the headers set by the generated code', async () => {
  const fetchMock = stubFetch(Response.json({}))

  await customFetch('/api/patients/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/fhir+json' },
  })

  expect(headersOf(fetchMock.mock.calls[0]).get('Content-Type')).toBe('application/fhir+json')
})

test('returns the data, status and headers like the generated client', async () => {
  stubFetch(Response.json({ status: 'ok' }, { status: 200 }))

  const response = await customFetch<{ data: unknown; status: number; headers: Headers }>(
    '/api/health/',
    { method: 'GET' },
  )

  expect(response.data).toEqual({ status: 'ok' })
  expect(response.status).toBe(200)
  expect(response.headers).toBeInstanceOf(Headers)
})

test('returns no data for 204 No Content', async () => {
  stubFetch(new Response(null, { status: 204 }))

  const response = await customFetch<{ data: unknown }>('/api/patients/x/', { method: 'DELETE' })

  expect(response.data).toBeUndefined()
})

test('throws an ApiError carrying the status and the parsed body on errors', async () => {
  const outcome = {
    resourceType: 'OperationOutcome',
    issue: [{ severity: 'error', code: 'not-found', diagnostics: 'Patient not found.' }],
  }
  stubFetch(Response.json(outcome, { status: 404 }))

  const error = await rejection(customFetch('/api/patients/x/', { method: 'GET' }))

  expect(error).toBeInstanceOf(ApiError)
  expect(error).toMatchObject({ status: 404, body: outcome })
})

test('an error with a non-JSON body still throws an ApiError', async () => {
  stubFetch(new Response('<html>Bad gateway</html>', { status: 502 }))

  const error = await rejection(customFetch('/api/patients/', { method: 'GET' }))

  expect(error).toBeInstanceOf(ApiError)
  expect(error).toMatchObject({ status: 502, body: undefined })
})

// --- CSRF failure: refresh the cookie and retry once ------------------------------------

const CSRF_FAILURES = {
  // /api/auth/* (DRF default error format)
  auth: { detail: "CSRF Failed: CSRF token from the 'X-Csrftoken' HTTP header has incorrect length." },
  // /api/patients/* (FHIR OperationOutcome)
  patients: {
    resourceType: 'OperationOutcome',
    issue: [{ severity: 'error', code: 'forbidden', diagnostics: 'CSRF token missing or invalid.' }],
  },
}

test.each(Object.entries(CSRF_FAILURES))(
  'a CSRF failure (%s format) refreshes the cookie and retries once',
  async (_format, failure) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(failure, { status: 403 }))
      .mockImplementationOnce(async () => {
        setCsrfCookie('refreshed-token')
        return new Response(null, { status: 204 })
      })
      .mockResolvedValueOnce(Response.json({ id: 'x' }, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await customFetch<{ status: number }>('/api/patients/', {
      method: 'POST',
      body: '{"resourceType":"Patient"}',
    })

    expect(response.status).toBe(201)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[1][0]).toBe('/api/auth/csrf/')
    const retry = fetchMock.mock.calls[2]
    expect(retry[0]).toBe('/api/patients/')
    expect(retry[1].body).toBe('{"resourceType":"Patient"}')
    expect(headersOf(retry).get('X-CSRFToken')).toBe('refreshed-token')
  },
)

test('a second CSRF failure is thrown, without another retry', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(Response.json(CSRF_FAILURES.patients, { status: 403 }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(Response.json(CSRF_FAILURES.patients, { status: 403 }))
  vi.stubGlobal('fetch', fetchMock)

  const error = await rejection(customFetch('/api/patients/', { method: 'POST' }))

  expect(error).toBeInstanceOf(ApiError)
  expect(error).toMatchObject({ status: 403 })
  expect(fetchMock).toHaveBeenCalledTimes(3)
})

test('other 403s are not retried', async () => {
  const forbidden = {
    resourceType: 'OperationOutcome',
    issue: [{ severity: 'error', code: 'forbidden', diagnostics: 'Forbidden.' }],
  }
  const fetchMock = stubFetch(Response.json(forbidden, { status: 403 }))

  const error = await rejection(customFetch('/api/patients/', { method: 'POST' }))

  expect(error).toMatchObject({ status: 403, body: forbidden })
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

test('safe requests are never retried (they carry no CSRF token)', async () => {
  const fetchMock = stubFetch(Response.json(CSRF_FAILURES.patients, { status: 403 }))

  const error = await rejection(customFetch('/api/patients/', { method: 'GET' }))

  expect(error).toMatchObject({ status: 403 })
  expect(fetchMock).toHaveBeenCalledTimes(1)
})
