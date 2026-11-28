// The only hand-written fetch in the app: every generated hook goes through it (Orval
// "mutator", see orval.config.ts). It sends the session cookie, adds the CSRF header on
// unsafe requests (refreshed and retried once if Django rejects it), and throws an
// ApiError on HTTP errors so TanStack Query sees them.

const CSRF_COOKIE = 'csrftoken'
const CSRF_HEADER = 'X-CSRFToken'
const CSRF_URL = '/api/auth/csrf/'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export class ApiError extends Error {
  readonly status: number
  // Parsed JSON body (a FHIR OperationOutcome on /api/patients/), undefined if not JSON.
  readonly body: unknown

  constructor(status: number, body: unknown) {
    super(`HTTP ${status}`) // never the body: it may quote patient data
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

function readCsrfCookie(): string | undefined {
  const cookie = document.cookie.split('; ').find((c) => c.startsWith(`${CSRF_COOKIE}=`))
  return cookie && decodeURIComponent(cookie.slice(CSRF_COOKIE.length + 1))
}

let pendingCsrf: Promise<unknown> | undefined

// Read on every request: Django rotates the token on login.
async function csrfToken({ refresh = false } = {}): Promise<string | undefined> {
  if (refresh || !readCsrfCookie()) {
    pendingCsrf ??= fetch(CSRF_URL, { credentials: 'include' }).finally(() => {
      pendingCsrf = undefined
    })
    await pendingCsrf
  }
  return readCsrfCookie()
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

// Django's two CSRF failure bodies: DRF's {detail} on /api/auth/, an OperationOutcome on
// /api/patients/ (fixed messages, see the api views).
function isCsrfFailure(status: number, body: unknown): boolean {
  if (status !== 403 || typeof body !== 'object' || body === null) return false
  const { detail, issue } = body as { detail?: unknown; issue?: { diagnostics?: unknown }[] }
  if (typeof detail === 'string') return detail.startsWith('CSRF Failed')
  return Array.isArray(issue) && issue.some((i) => String(i?.diagnostics).startsWith('CSRF token'))
}

async function send(url: string, options: RequestInit, csrf: 'none' | 'cookie' | 'refresh') {
  const headers = new Headers(options.headers)
  if (csrf !== 'none') {
    const token = await csrfToken({ refresh: csrf === 'refresh' })
    if (token) headers.set(CSRF_HEADER, token)
  }
  const response = await fetch(url, { ...options, headers, credentials: 'include' })
  return { response, data: await parseBody(response) }
}

export async function customFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const unsafe = !SAFE_METHODS.has((options.method ?? 'GET').toUpperCase())
  let result = await send(url, options, unsafe ? 'cookie' : 'none')
  // A rejected CSRF token means Django refused the request before running it: safe to
  // retry once (even a POST) with a fresh cookie. A second failure is thrown.
  if (unsafe && isCsrfFailure(result.response.status, result.data)) {
    result = await send(url, options, 'refresh')
  }
  const { response, data } = result
  if (!response.ok) throw new ApiError(response.status, data)
  return { data, status: response.status, headers: response.headers } as T
}
