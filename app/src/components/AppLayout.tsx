import { Outlet } from 'react-router'
import { useGetMe } from '../api/generated/endpoints'
import { LogoutButton } from './LogoutButton'

/** The signed-in shell: header with the practitioner and logout, then the page. */
export function AppLayout() {
  const { data } = useGetMe() // already loaded by ProtectedRoute
  const user = data?.data

  return (
    <>
      {/* One line on every screen: the practitioner's name truncates on narrow ones. */}
      <header className="flex items-center justify-between gap-3 border-b border-line px-6 py-3 md:px-[12vw]">
        <p className="shrink-0 font-semibold text-pine">Patient Management</p>
        <div className="flex min-w-0 items-center gap-3 md:gap-4">
          {user && (
            <p className="truncate text-muted">
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
