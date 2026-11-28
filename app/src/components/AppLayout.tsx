import { Outlet } from 'react-router'
import { useGetMe } from '../api/generated/endpoints'
import { LogoutButton } from './LogoutButton'

/** The signed-in shell: header with the practitioner and logout, then the page. */
export function AppLayout() {
  const { data } = useGetMe() // already loaded by ProtectedRoute
  const user = data?.data

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-3 md:px-[12vw]">
        <p className="font-semibold text-pine">Patient Management</p>
        <div className="flex items-center gap-4">
          {user && (
            <p className="text-muted">
              {user.first_name} {user.last_name}
            </p>
          )}
          <LogoutButton />
        </div>
      </header>
      <Outlet />
    </>
  )
}
