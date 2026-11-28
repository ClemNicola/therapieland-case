import { useState } from 'react'
import { ageOn, formatBirthDate, type PatientRow } from '../../lib/patientFhir'

// Patient fields shared by the table columns and the mobile cards.

export function BirthDate({ date, prefix = '' }: { date: string; prefix?: string }) {
  const [today] = useState(() => new Date()) // read once: render stays pure (React Compiler)
  return (
    <>
      {prefix}
      {formatBirthDate(date)} <span className="text-muted">({ageOn(date, today)})</span>
    </>
  )
}

export function Contact({ patient }: { patient: PatientRow }) {
  if (!patient.phone && !patient.email) return <span className="text-muted">No contact details</span>
  return (
    <>
      {patient.phone && <span className="block">{patient.phone}</span>}
      {patient.email && <span className="block break-all">{patient.email}</span>}
    </>
  )
}
