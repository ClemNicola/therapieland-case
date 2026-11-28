import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { useLogout } from '../api/generated/endpoints'

export function LogoutButton() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  // A 401 (session already gone) is handled globally by the query client.
  const logout = useLogout({
    mutation: {
      onSuccess: () => {
        queryClient.removeQueries() // no patient data left in memory
        void navigate('/login', { replace: true })
      },
    },
  })

  return (
    <div className="flex items-center gap-3">
      {logout.isError && (
        <p role="alert" className="text-sm text-brick">
          Couldn't log out. Try again.
        </p>
      )}
      <button
        type="button"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
        className="min-h-11 rounded-md border border-line bg-white px-4 font-medium hover:border-pine disabled:opacity-70"
      >
        Log out
      </button>
    </div>
  )
}
