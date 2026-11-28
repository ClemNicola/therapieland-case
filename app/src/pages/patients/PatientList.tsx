import { useTable, type SortingState } from '@tanstack/react-table'
import { useState } from 'react'
import { DataTable } from '../../components/DataTable'
import { SearchInput } from '../../components/SearchInput'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import type { PatientRow } from '../../lib/patientFhir'
import { PatientCards } from './PatientCards'
import { patientColumns, patientFeatures } from './patientColumns'

const INITIAL_SORT: SortingState = [{ id: 'name', desc: false }]

/** The patient list: one TanStack row model (search + sort), as cards on mobile, a table above. */
export function PatientList({ patients }: { patients: PatientRow[] }) {
  const [sorting, setSorting] = useState(INITIAL_SORT)
  const [globalFilter, setGlobalFilter] = useState('')
  const isLargeScreen = useMediaQuery('(min-width: 768px)')
  const table = useTable({
    features: patientFeatures,
    columns: patientColumns,
    data: patients,
    getRowId: (patient) => patient.id,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: 'patient',
    getColumnCanGlobalFilter: (column) => column.id === 'name',
    enableSortingRemoval: false,
  })
  const rows = table.getRowModel().rows
  const descending = sorting[0]?.desc ?? false

  return (
    <>
      <div className="mt-6 md:max-w-md">
        <SearchInput
          label="Search patients"
          value={globalFilter}
          onChange={setGlobalFilter}
          placeholder="Name or patient ID"
        />
      </div>
      <p aria-live="polite" className="mt-3 text-sm text-muted">
        {globalFilter.trim()
          ? `Showing ${rows.length} of ${patients.length} patients`
          : `${patients.length} ${patients.length === 1 ? 'patient' : 'patients'}`}
      </p>

      {rows.length === 0 ? (
        <p className="mt-8 font-medium">No patients match your search.</p>
      ) : isLargeScreen ? (
        <div className="mt-4">
          <DataTable table={table} rows={rows} label="Patients" rowHeader="name" />
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setSorting([{ id: 'name', desc: !descending }])}
            className="mt-2 mb-4 min-h-11 rounded-md border border-line bg-white px-4 font-medium hover:border-pine"
          >
            {descending ? 'Sort by name, A to Z' : 'Sort by name, Z to A'}
          </button>
          <PatientCards patients={rows.map((row) => row.original)} />
        </>
      )}
    </>
  )
}
