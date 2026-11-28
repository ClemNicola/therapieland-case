import { useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../api/client'
import { getListPatientsQueryKey, useDeletePatient } from '../../api/generated/endpoints'
import { Dialog } from '../../components/Dialog'
import { fullName, type PatientRow } from '../../lib/patientFhir'
import { PATIENT_GONE } from './messages'

/** Confirms DELETE /api/patients/{id}/: the practitioner stops following the patient. */
export function ArchivePatientDialog({
  patient,
  onClose,
  onDone,
}: {
  patient: PatientRow
  onClose: () => void
  onDone: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const remove = useDeletePatient()
  const name = fullName(patient)
  const refreshList = () => queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() })

  const confirm = async () => {
    try {
      await remove.mutateAsync({ id: patient.id })
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) return
      await refreshList()
      return onDone(PATIENT_GONE)
    }
    await refreshList()
    onDone(`You no longer follow ${name}.`)
  }

  return (
    <Dialog title={`Stop following ${name}?`} onClose={onClose}>
      <p>
        {name} leaves your list; colleagues who follow them keep access. A patient nobody follows
        is archived, not deleted.
      </p>
      {remove.isError && !(remove.error instanceof ApiError && remove.error.status === 404) && (
        <p role="alert" className="mt-4 border-l-4 border-brick bg-white px-4 py-3 text-brick">
          Couldn't stop following this patient. Try again.
        </p>
      )}
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        {/* Focus starts on Cancel: the safe choice. */}
        <button type="button" data-autofocus onClick={onClose} className="min-h-11 rounded-md border border-line bg-white px-5 font-medium hover:border-pine">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void confirm()}
          disabled={remove.isPending}
          className="min-h-11 rounded-md bg-brick px-5 font-semibold text-white hover:opacity-90 disabled:opacity-70"
        >
          Stop following
        </button>
      </div>
    </Dialog>
  )
}
