import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  globalFilteringFeature,
  rowSortingFeature,
  tableFeatures,
} from '@tanstack/react-table'
import {
  compareByName,
  fullName,
  GENDER_LABELS,
  patientMatches,
  shortId,
  type PatientRow,
} from '../../lib/patientFhir'
import { BirthDate, Contact } from './PatientFields'

// Module scope: TanStack Table needs stable features and columns.
export const patientFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  sortFns: { byName: (a, b) => compareByName(a.original as PatientRow, b.original as PatientRow) },
  // Global search: name and id (see patientMatches), evaluated once per row on the name column.
  filterFns: {
    patient: (row, _columnId, query) => patientMatches(row.original as PatientRow, String(query)),
  },
})

const helper = createColumnHelper<typeof patientFeatures, PatientRow>()

export const patientColumns = helper.columns([
  helper.accessor(fullName, { id: 'name', header: 'Name', sortFn: 'byName' }),
  helper.accessor('id', {
    header: 'ID',
    enableSorting: false,
    cell: (info) => <span className="font-mono text-sm text-muted">{shortId(info.getValue())}</span>,
  }),
  helper.accessor('birthDate', {
    header: 'Birth date',
    enableSorting: false,
    cell: (info) => <BirthDate date={info.getValue()} />,
  }),
  helper.accessor('gender', {
    header: 'Gender',
    enableSorting: false,
    cell: (info) => GENDER_LABELS[info.getValue()],
  }),
  helper.display({
    id: 'contact',
    header: 'Contact',
    cell: (info) => <Contact patient={info.row.original} />,
  }),
])
