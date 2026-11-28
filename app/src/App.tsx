import { AuthGate } from './auth/AuthGate'
import { LogoutButton } from './auth/LogoutButton'

export default function App() {
  return (
    <AuthGate>
      {(user) => (
        <>
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-3 md:px-[12vw]">
            <p className="font-semibold text-pine">Patient Management</p>
            <div className="flex items-center gap-4">
              <p className="text-muted">
                {user.first_name} {user.last_name}
              </p>
              <LogoutButton />
            </div>
          </header>
          <main className="px-6 pt-10 md:px-[12vw]">
            <h1 className="text-3xl font-semibold tracking-tight">Patients</h1>
            <p className="mt-2 text-muted">Your patient list comes in the next step.</p>
          </main>
        </>
      )}
    </AuthGate>
  )
}
