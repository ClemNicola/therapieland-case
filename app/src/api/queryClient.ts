import {
  MutationCache,
  QueryCache,
  QueryClient,
  type DefaultOptions,
  type Query,
} from '@tanstack/react-query'
import { ApiError } from './client'
import { getGetMeQueryKey } from './generated/endpoints'

const ME_KEY = getGetMeQueryKey()

function isMeQuery(query: Pick<Query, 'queryHash'>) {
  return query.queryHash === JSON.stringify(ME_KEY)
}

function isUnauthenticated(error: unknown) {
  return error instanceof ApiError && error.status === 401
}

/**
 * Forgets everything about the session on this device: removes every cached query (patient
 * data included), then re-checks the session. The /me query answers 401 and the auth guard
 * shows the login form.
 */
export function signOutLocally(queryClient: QueryClient) {
  queryClient.removeQueries({ predicate: (query) => !isMeQuery(query) })
  return queryClient.resetQueries({ queryKey: ME_KEY })
}

// 4xx won't change on retry; server and network errors might.
function retry(failureCount: number, error: unknown) {
  if (error instanceof ApiError && error.status < 500) return false
  return failureCount < 2
}

/**
 * The app's TanStack Query client. The cache lives in memory only (never persisted) and is
 * emptied as soon as the session ends: any 401 signs out locally.
 */
export function createQueryClient(queryDefaults: DefaultOptions['queries'] = {}) {
  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (!isUnauthenticated(error)) return
        if (isMeQuery(query)) {
          // Already the session check: just make sure no other data stays cached.
          queryClient.removeQueries({ predicate: (other) => !isMeQuery(other) })
        } else {
          void signOutLocally(queryClient)
        }
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        if (isUnauthenticated(error)) void signOutLocally(queryClient)
      },
    }),
    defaultOptions: { queries: { retry, ...queryDefaults } },
  })
  return queryClient
}
