import { expect, test, vi } from 'vitest'
import { ApiError } from './client'
import { getGetMeQueryKey } from './generated/endpoints'
import { createQueryClient } from './queryClient'

const ME = getGetMeQueryKey()
const PATIENTS = ['/api/patients/']
const unauthorized = () => Promise.reject(new ApiError(401, undefined))

function setup() {
  const onUnauthenticated = vi.fn()
  const queryClient = createQueryClient({ onUnauthenticated, queryDefaults: { retryDelay: 0 } })
  queryClient.setQueryData(ME, { data: { first_name: 'Alice' } })
  queryClient.setQueryData(['/api/patients/other/'], { data: 'fake patient' })
  return { queryClient, onUnauthenticated }
}

function nothingCached(queryClient: ReturnType<typeof createQueryClient>) {
  return queryClient.getQueryCache().getAll().every((query) => query.state.data === undefined)
}

test('a 401 on any query empties the cache and redirects to login', async () => {
  const { queryClient, onUnauthenticated } = setup()

  await queryClient.fetchQuery({ queryKey: PATIENTS, queryFn: unauthorized }).catch(() => {})

  expect(onUnauthenticated).toHaveBeenCalledTimes(1)
  expect(nothingCached(queryClient)).toBe(true)
})

test('a 401 on a mutation empties the cache and redirects to login', async () => {
  const { queryClient, onUnauthenticated } = setup()

  await queryClient
    .getMutationCache()
    .build(queryClient, { mutationFn: unauthorized })
    .execute(undefined)
    .catch(() => {})

  expect(onUnauthenticated).toHaveBeenCalledTimes(1)
  expect(nothingCached(queryClient)).toBe(true)
})

test('a 401 on the session check does not loop', async () => {
  const { queryClient, onUnauthenticated } = setup()
  const meQueryFn = vi.fn(unauthorized)

  await queryClient.fetchQuery({ queryKey: ME, queryFn: meQueryFn, staleTime: 0 }).catch(() => {})
  await new Promise((resolve) => setTimeout(resolve, 20))

  expect(meQueryFn).toHaveBeenCalledTimes(1)
  expect(onUnauthenticated).toHaveBeenCalledTimes(1)
})

test.each([400, 403, 404])('client errors (%i) are not retried', async (status) => {
  const { queryClient, onUnauthenticated } = setup()
  const queryFn = vi.fn().mockRejectedValue(new ApiError(status, undefined))

  await queryClient
    .fetchQuery({ queryKey: PATIENTS, queryFn, retry: queryClient.getDefaultOptions().queries?.retry })
    .catch(() => {})

  expect(queryFn).toHaveBeenCalledTimes(1)
  expect(onUnauthenticated).not.toHaveBeenCalled()
})

test('server and network errors are retried', async () => {
  const { queryClient } = setup()
  const queryFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

  // fetchQuery doesn't retry by default: use the app's default query options.
  await queryClient
    .fetchQuery({ queryKey: PATIENTS, queryFn, retry: queryClient.getDefaultOptions().queries?.retry })
    .catch(() => {})

  expect(queryFn.mock.calls.length).toBeGreaterThan(1)
})
