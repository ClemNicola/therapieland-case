import type { ReactTable, Row, RowData, TableFeatures } from '@tanstack/react-table'

type SortableColumn = {
  getCanSort: () => boolean
  getIsSorted: () => false | 'asc' | 'desc'
  toggleSorting: () => void
}

// Columns only have the sorting API when the table registers the sorting feature.
function sortable(column: object): SortableColumn | undefined {
  const candidate = column as Partial<SortableColumn>
  return typeof candidate.getCanSort === 'function' && candidate.getCanSort()
    ? (candidate as SortableColumn)
    : undefined
}

/**
 * Renders any TanStack table: column headers (sort button + aria-sort on sortable columns)
 * and rows. `rowHeader` names the column rendered as the row's header cell (<th scope="row">).
 *
 * React Compiler: the `table` instance keeps its identity across renders, so the rows come
 * in as a prop (new data, filtering, sorting) and the header subscribes to the sort state.
 */
export function DataTable<TFeatures extends TableFeatures, TData extends RowData>({
  table,
  rows,
  label,
  rowHeader,
}: {
  table: ReactTable<TFeatures, TData>
  rows: Row<TFeatures, TData>[]
  label: string
  rowHeader?: string
}) {
  return (
    <table aria-label={label} className="w-full border-collapse text-left">
      <thead>
        <table.Subscribe selector={(state) => state}>
          {() =>
            table.getHeaderGroups().map((group) => (
              <tr key={group.id} className="border-b border-line text-sm text-muted">
                {group.headers.map((header) => {
                  const column = sortable(header.column)
                  const canSort = column !== undefined
                  const sorted = column?.getIsSorted() ?? false
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={
                        canSort ? (sorted ? (sorted === 'desc' ? 'descending' : 'ascending') : 'none') : undefined
                      }
                      className="py-2 pr-4 font-medium last:pr-0"
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={() => column?.toggleSorting()}
                          className="-ml-2 min-h-11 rounded-md px-2 hover:text-ink"
                        >
                          <table.FlexRender header={header} />{' '}
                          <span aria-hidden="true">{sorted === 'desc' ? '↓' : sorted ? '↑' : '↕'}</span>
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </th>
                  )
                })}
              </tr>
            ))
          }
        </table.Subscribe>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="border-b border-line align-top">
            {row.getAllCells().map((cell) =>
              cell.column.id === rowHeader ? (
                <th key={cell.id} scope="row" className="py-3 pr-4 font-semibold">
                  <table.FlexRender cell={cell} />
                </th>
              ) : (
                <td key={cell.id} className="py-3 pr-4 last:pr-0">
                  <table.FlexRender cell={cell} />
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
