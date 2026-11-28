import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  globalFilteringFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type SortingState,
} from '@tanstack/react-table'
import { useState } from 'react'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import {
  ageOn,
  compareByName,
  formatBirthDate,
  fullName,
  GENDER_LABELS,
  patientMatches,
  shortId,
  type PatientRow,
} from '../../lib/patientFhir'

// Module scope: TanStack Table needs stable features and columns.
const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  sortFns: { byName: (a, b) => compareByName(a.original as PatientRow, b.original as PatientRow) },
  filterFns: {
    patient: (row, _columnId, query) => patientMatches(row.original as PatientRow, String(query)),
  },
})
const helper = createColumnHelper<typeof features, PatientRow>()
// One column drives sorting and search; the views render the row's fields directly.
const columns = helper.columns([helper.accessor(fullName, { id: 'name', sortFn: 'byName' })])
const INITIAL_SORT: SortingState = [{ id: 'name', desc: false }]

/** The patient list: one TanStack row model (search + sort), as cards on mobile, a table above. */
export function PatientList({ patients }: { patients: PatientRow[] }) {
  const [sorting, setSorting] = useState(INITIAL_SORT)
  const [globalFilter, setGlobalFilter] = useState('')
  const isLargeScreen = useMediaQuery('(min-width: 768px)')
  const table = useTable({
    features,
    columns,
    data: patients,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: 'patient',
    getColumnCanGlobalFilter: (column) => column.id === 'name',
    enableSortingRemoval: false,
  })
  const rows = table.getRowModel().rows.map((row) => row.original)
  const descending = sorting[0]?.desc ?? false
  const toggleSort = () => setSorting([{ id: 'name', desc: !descending }])
  const [today] = useState(() => new Date()) // read once: render stays pure (React Compiler)

  return (
    <>
      <div className="mt-6 flex flex-col gap-2 md:max-w-md">
        <label htmlFor="patient-search" className="font-medium">
          Search patients
        </label>
        <input
          id="patient-search"
          type="search"
          value={globalFilter}
          onChange={(event) => setGlobalFilter(event.target.value)}
          placeholder="Name or patient ID"
          autoComplete="off"
          className="min-h-11 w-full rounded-md border border-line bg-white px-3 text-base"
        />
      </div>
      <p aria-live="polite" className="mt-3 text-sm text-muted">
        {globalFilter.trim()
          ? `Showing ${rows.length} of ${patients.length} patients`
          : `${patients.length} ${patients.length === 1 ? 'patient' : 'patients'}`}
      </p>

      {rows.length === 0 ? (
        <div className="mt-8">
          <p className="font-medium">No patients match your search.</p>
          <button
            type="button"
            onClick={() => setGlobalFilter('')}
            className="mt-3 min-h-11 rounded-md border border-line bg-white px-4 font-medium hover:border-pine"
          >
            Clear search
          </button>
        </div>
      ) : isLargeScreen ? (
        <table aria-label="Patients" className="mt-4 w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line text-sm text-muted">
              <th scope="col" aria-sort={descending ? 'descending' : 'ascending'} className="py-2 pr-4 font-medium">
                <button type="button" onClick={toggleSort} className="-ml-2 min-h-11 rounded-md px-2 hover:text-ink">
                  Name <span aria-hidden="true">{descending ? '↓' : '↑'}</span>
                </button>
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">ID</th>
              <th scope="col" className="py-2 pr-4 font-medium">Birth date</th>
              <th scope="col" className="py-2 pr-4 font-medium">Gender</th>
              <th scope="col" className="py-2 font-medium">Contact</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((patient) => (
              <tr key={patient.id} className="border-b border-line align-top">
                <th scope="row" className="py-3 pr-4 font-semibold">
                  {fullName(patient)}
                </th>
                <td className="py-3 pr-4 font-mono text-sm text-muted">{shortId(patient.id)}</td>
                <td className="py-3 pr-4">
                  {formatBirthDate(patient.birthDate)}{' '}
                  <span className="text-muted">({ageOn(patient.birthDate, today)})</span>
                </td>
                <td className="py-3 pr-4">{GENDER_LABELS[patient.gender]}</td>
                <td className="py-3">
                  <Contact patient={patient} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <>
          <button
            type="button"
            onClick={toggleSort}
            className="mt-2 min-h-11 rounded-md border border-line bg-white px-4 font-medium hover:border-pine"
          >
            {descending ? 'Sort by name, A to Z' : 'Sort by name, Z to A'}
          </button>
          <ul aria-label="Patients" className="mt-4 flex flex-col gap-3">
            {rows.map((patient) => (
              <li key={patient.id} className="rounded-md border border-line bg-white p-4">
                <h2 className="text-lg font-semibold">{fullName(patient)}</h2>
                <p className="mt-1 text-sm text-muted">
                  ID <span className="font-mono">{shortId(patient.id)}</span>
                </p>
                <p className="mt-3">
                  Born {formatBirthDate(patient.birthDate)}{' '}
                  <span className="text-muted">({ageOn(patient.birthDate, today)})</span>
                </p>
                <p>{GENDER_LABELS[patient.gender]}</p>
                <div className="mt-2">
                  <Contact patient={patient} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

function Contact({ patient }: { patient: PatientRow }) {
  if (!patient.phone && !patient.email) return <span className="text-muted">No contact details</span>
  return (
    <>
      {patient.phone && <span className="block">{patient.phone}</span>}
      {patient.email && <span className="block break-all">{patient.email}</span>}
    </>
  )
}
