import { useState } from 'react'
import { useListPatients } from '../../api/generated/endpoints'
import { bundleToRows, type PatientRow } from '../../lib/patientFhir'
import { ArchivePatientDialog } from './ArchivePatientDialog'
import { PatientActionsProvider } from './PatientActions'
import { PatientFormDialog } from './PatientFormDialog'
import { PatientList } from './PatientList'

type OpenDialog =
  | { kind: 'add' }
  | { kind: 'edit'; patient: PatientRow }
  | { kind: 'stop-following'; patient: PatientRow }

const PRIMARY_BUTTON =
  'min-h-11 rounded-md bg-pine px-5 font-semibold text-white hover:bg-pine-dark'

export function PatientsPage() {
  const list = useListPatients()
  // client.ts throws on non-2xx: a loaded response is always the 200 Bundle.
  const bundle = list.data?.status === 200 ? list.data.data : undefined
  const [dialog, setDialog] = useState<OpenDialog | null>(null)
  const [message, setMessage] = useState('')
  const close = () => setDialog(null)
  const done = (text: string) => {
    setDialog(null)
    setMessage(text)
  }
  const addButton = (
    <button type="button" onClick={() => setDialog({ kind: 'add' })} className={PRIMARY_BUTTON}>
      Add patient
    </button>
  )

  return (
    <main className="px-6 pt-8 pb-16 md:px-[12vw] md:pt-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* tabIndex -1: the dialogs return the focus here when their opener is gone. */}
        <h1 tabIndex={-1} className="text-3xl font-semibold tracking-tight focus:outline-none">
          Patients
        </h1>
        {bundle?.entry?.length ? addButton : null}
      </div>
      {/* Announces what the dialogs did (added, updated, stopped following). */}
      <p aria-live="polite" className="mt-3 empty:hidden">
        {message}
      </p>

      {list.isPending ? (
        <p role="status" className="mt-6 text-muted">
          Loading patients…
        </p>
      ) : list.isError ? (
        <div className="mt-6">
          <p role="alert" className="font-medium text-brick">
            Couldn't load your patients.
          </p>
          <button type="button" onClick={() => void list.refetch()} className={`mt-3 ${PRIMARY_BUTTON}`}>
            Try again
          </button>
        </div>
      ) : !bundle?.entry?.length ? (
        <div className="mt-6">
          <p className="font-medium">No patients yet.</p>
          <p className="mt-1 mb-4 text-muted">Patients you add or follow will appear here.</p>
          {addButton}
        </div>
      ) : (
        <PatientActionsProvider
          value={{
            onEdit: (patient) => setDialog({ kind: 'edit', patient }),
            onStopFollowing: (patient) => setDialog({ kind: 'stop-following', patient }),
          }}
        >
          <PatientList patients={bundleToRows(bundle)} />
        </PatientActionsProvider>
      )}

      {dialog?.kind === 'add' && <PatientFormDialog onClose={close} onDone={done} />}
      {dialog?.kind === 'edit' && (
        <PatientFormDialog patient={dialog.patient} onClose={close} onDone={done} />
      )}
      {dialog?.kind === 'stop-following' && (
        <ArchivePatientDialog patient={dialog.patient} onClose={close} onDone={done} />
      )}
    </main>
  )
}
