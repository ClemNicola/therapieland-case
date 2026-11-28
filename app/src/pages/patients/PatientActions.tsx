import { createContext, use, type ReactNode } from 'react'
import { fullName, type PatientRow } from '../../lib/patientFhir'

type Actions = {
  onEdit: (patient: PatientRow) => void
  onStopFollowing: (patient: PatientRow) => void
}

// The column definitions live at module scope (stable for TanStack Table): the actions
// reach the row buttons through context instead.
const ActionsContext = createContext<Actions | null>(null)

export function PatientActionsProvider({ value, children }: { value: Actions; children: ReactNode }) {
  return <ActionsContext value={value}>{children}</ActionsContext>
}

/** Edit and Stop following buttons. The accessible names start with the visible text (WCAG 2.5.3). */
export function PatientActions({ patient }: { patient: PatientRow }) {
  const actions = use(ActionsContext)
  if (!actions) return null
  const name = fullName(patient)
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => actions.onEdit(patient)}
        aria-label={`Edit ${name}`}
        className="min-h-11 rounded-md border border-line bg-white px-3 font-medium hover:border-pine"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={() => actions.onStopFollowing(patient)}
        aria-label={`Stop following ${name}`}
        className="min-h-11 rounded-md px-3 font-medium text-brick hover:bg-white"
      >
        Stop following
      </button>
    </div>
  )
}
