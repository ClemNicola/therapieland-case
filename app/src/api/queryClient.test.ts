import { QueryObserver } from '@tanstack/react-query'
import { expect, test, vi } from 'vitest'
import { getGetMeQueryKey } from './generated/endpoints'
import { ApiError } from './client'
import { createQueryClient } from './queryClient'

const ME = getGetMeQueryKey()
const PATIENTS = ['/api/patients/']

test('a 401 on any query removes every cached query and re-checks the session', async () => {
  const queryClient = createQueryClient({ retryDelay: 0 })
  const meQueryFn = vi.fn().mockRejectedValue(new ApiError(401, undefined))
  queryClient.setQueryData(ME, { data: { first_name: 'Alice' } })
  queryClient.setQueryData(['/api/patients/other/'], { data: 'fake patient' })
  // The /me query is active: the auth guard observes it (fresh, so it doesn't refetch now).
  const unsubscribe = new QueryObserver(queryClient, {
    queryKey: ME,
    queryFn: meQueryFn,
    staleTime: Infinity,
  }).subscribe(() => {})
  expect(meQueryFn).not.toHaveBeenCalled()

  await queryClient
    .fetchQuery({ queryKey: PATIENTS, queryFn: () => Promise.reject(new ApiError(401, undefined)) })
    .catch(() => {})

  await vi.waitFor(() => expect(meQueryFn).toHaveBeenCalled())
  expect(queryClient.getQueryData(PATIENTS)).toBeUndefined()
  expect(queryClient.getQueryData(['/api/patients/other/'])).toBeUndefined()
  expect(queryClient.getQueryData(ME)).toBeUndefined()
  unsubscribe()
})

test('a 401 on the session check itself does not loop', async () => {
  const queryClient = createQueryClient({ retryDelay: 0 })
  const meQueryFn = vi.fn().mockRejectedValue(new ApiError(401, undefined))

  await queryClient.fetchQuery({ queryKey: ME, queryFn: meQueryFn }).catch(() => {})
  await new Promise((resolve) => setTimeout(resolve, 20))

  expect(meQueryFn).toHaveBeenCalledTimes(1)
})

test('a 401 on a mutation also signs out locally', async () => {
  const queryClient = createQueryClient({ retryDelay: 0 })
  queryClient.setQueryData(PATIENTS, { data: 'fake patient' })

  await queryClient
    .getMutationCache()
    .build(queryClient, { mutationFn: () => Promise.reject(new ApiError(401, undefined)) })
    .execute(undefined)
    .catch(() => {})

  expect(queryClient.getQueryData(PATIENTS)).toBeUndefined()
})

test.each([400, 403, 404])('client errors (%i) are not retried', async (status) => {
  const queryClient = createQueryClient({ retryDelay: 0 })
  const queryFn = vi.fn().mockRejectedValue(new ApiError(status, undefined))

  await queryClient.fetchQuery({ queryKey: PATIENTS, queryFn }).catch(() => {})

  expect(queryFn).toHaveBeenCalledTimes(1)
})

test('server and network errors are retried', async () => {
  const queryClient = createQueryClient({ retryDelay: 0 })
  const queryFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

  // fetchQuery doesn't retry by default: go through the default query options.
  await queryClient
    .fetchQuery({ queryKey: PATIENTS, queryFn, retry: queryClient.getDefaultOptions().queries?.retry })
    .catch(() => {})

  expect(queryFn.mock.calls.length).toBeGreaterThan(1)
})
