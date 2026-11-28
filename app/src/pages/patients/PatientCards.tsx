import { fullName, GENDER_LABELS, shortId, type PatientRow } from '../../lib/patientFhir'
import { BirthDate, Contact } from './PatientFields'

/** The mobile view of the patient list: same rows as the table, one card each. */
export function PatientCards({ patients }: { patients: PatientRow[] }) {
  return (
    <ul aria-label="Patients" className="flex flex-col gap-3">
      {patients.map((patient) => (
        <li key={patient.id} className="rounded-md border border-line bg-white p-4">
          <h2 className="text-lg font-semibold">{fullName(patient)}</h2>
          <p className="mt-1 text-sm text-muted">
            ID <span className="font-mono">{shortId(patient.id)}</span>
          </p>
          <p className="mt-3">
            <BirthDate date={patient.birthDate} prefix="Born " />
          </p>
          <p>{GENDER_LABELS[patient.gender]}</p>
          <div className="mt-2">
            <Contact patient={patient} />
          </div>
        </li>
      ))}
    </ul>
  )
}
