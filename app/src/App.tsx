import { useGetHealth } from './api/generated/endpoints'

export default function App() {
  const { data, isPending, isError } = useGetHealth()
  const apiStatus = isPending ? 'checking…' : isError ? 'unreachable' : data.data.status

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-4 p-6 md:max-w-2xl">
      <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">Patient Management</h1>
      <p className="text-slate-600">
        API status: <span className="font-medium text-slate-900">{apiStatus}</span>
      </p>
    </main>
  )
}
