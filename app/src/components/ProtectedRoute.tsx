import { Navigate, Outlet } from 'react-router'
import { ApiError } from '../api/client'
import { useGetMe } from '../api/generated/endpoints'

/**
 * Guards the routes below it: asks the API who is logged in (GET /api/auth/me/).
 * 401 → /login. Other errors → retry screen (the session may still be valid).
 */
export function ProtectedRoute() {
  const me = useGetMe()

  if (me.isPending) {
    return (
      <p role="status" className="grid min-h-[calc(100svh-4px)] place-items-center text-muted">
        Loading…
      </p>
    )
  }
  if (me.isError) {
    if (me.error instanceof ApiError && me.error.status === 401) {
      return <Navigate to="/login" replace />
    }
    return (
      <main className="mx-auto flex min-h-[calc(100svh-4px)] w-full max-w-sm flex-col justify-center px-6 py-12">
        <div role="alert">
          <h1 className="text-2xl font-semibold tracking-tight">We couldn't reach the server.</h1>
          <p className="mt-2 text-muted">Check your connection, then try again.</p>
        </div>
        <button
          type="button"
          onClick={() => void me.refetch()}
          className="mt-6 min-h-11 rounded-md bg-pine px-5 font-semibold text-white hover:bg-pine-dark"
        >
          Try again
        </button>
      </main>
    )
  }
  return <Outlet />
}
