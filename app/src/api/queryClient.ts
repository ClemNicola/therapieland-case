import { MutationCache, QueryCache, QueryClient, type DefaultOptions } from '@tanstack/react-query'
import { ApiError } from './client'

function isUnauthenticated(error: unknown) {
  return error instanceof ApiError && error.status === 401
}

// 4xx won't change on retry; server and network errors might.
function retry(failureCount: number, error: unknown) {
  if (error instanceof ApiError && error.status < 500) return false
  return failureCount < 2
}

/**
 * The app's TanStack Query client. The cache lives in memory only (never persisted). Any
 * 401 means the session is over: every cached query (patient data included) is removed and
 * `onUnauthenticated` is called (main.tsx redirects to /login). Screens never handle 401.
 */
export function createQueryClient({
  onUnauthenticated,
  queryDefaults = {},
}: {
  onUnauthenticated: () => void
  queryDefaults?: DefaultOptions['queries']
}) {
  const handleError = (error: unknown) => {
    if (!isUnauthenticated(error)) return
    queryClient.removeQueries()
    onUnauthenticated()
  }
  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: handleError }),
    mutationCache: new MutationCache({ onError: handleError }),
    defaultOptions: { queries: { retry, ...queryDefaults } },
  })
  return queryClient
}
