import { useListPatients } from '../../api/generated/endpoints'
import { bundleToRows } from '../../lib/patientFhir'
import { PatientList } from './PatientList'

export function PatientsPage() {
  const list = useListPatients()
  // client.ts throws on non-2xx: a loaded response is always the 200 Bundle.
  const bundle = list.data?.status === 200 ? list.data.data : undefined

  return (
    <main className="px-6 pt-8 pb-16 md:px-[12vw] md:pt-10">
      <h1 className="text-3xl font-semibold tracking-tight">Patients</h1>
      {list.isPending ? (
        <p role="status" className="mt-6 text-muted">
          Loading patients…
        </p>
      ) : list.isError ? (
        <div className="mt-6">
          <p role="alert" className="font-medium text-brick">
            Couldn't load your patients.
          </p>
          <button
            type="button"
            onClick={() => void list.refetch()}
            className="mt-3 min-h-11 rounded-md bg-pine px-5 font-semibold text-white hover:bg-pine-dark"
          >
            Try again
          </button>
        </div>
      ) : !bundle?.entry?.length ? (
        <div className="mt-6">
          <p className="font-medium">No patients yet.</p>
          <p className="mt-1 text-muted">Patients you add or follow will appear here.</p>
        </div>
      ) : (
        <PatientList patients={bundleToRows(bundle)} />
      )}
    </main>
  )
}
