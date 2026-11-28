import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_text,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { DataTable } from './DataTable'

type Fruit = { id: string; name: string; colour: string }

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { text: sortFn_text },
})
const helper = createColumnHelper<typeof features, Fruit>()
const columns = helper.columns([
  helper.accessor('name', { header: 'Name', sortFn: 'text' }),
  helper.accessor('colour', { header: 'Colour', enableSorting: false }),
])

const FRUITS: Fruit[] = [
  { id: '1', name: 'Pear', colour: 'Green' },
  { id: '2', name: 'Apple', colour: 'Red' },
]

function Fruits({ data }: { data: Fruit[] }) {
  const table = useTable({
    features,
    columns,
    data,
    getRowId: (row) => row.id,
    initialState: { sorting: [{ id: 'name', desc: false }] },
    enableSortingRemoval: false,
  })
  return <DataTable table={table} rows={table.getRowModel().rows} label="Fruits" rowHeader="name" />
}

const names = () => screen.getAllByRole('rowheader').map((cell) => cell.textContent)

test('renders a labelled table with the columns and rows', () => {
  render(<Fruits data={FRUITS} />)

  expect(screen.getByRole('table', { name: 'Fruits' })).toBeInTheDocument()
  expect(screen.getAllByRole('columnheader')).toHaveLength(2)
  expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument() // arrow is aria-hidden
  expect(screen.getByRole('columnheader', { name: 'Colour' })).toBeInTheDocument()
  expect(names()).toEqual(['Apple', 'Pear']) // the row header column
  const firstRow = screen.getAllByRole('row')[1]
  expect(within(firstRow).getByRole('cell')).toHaveTextContent('Red')
})

test('sortable columns have a sort button and aria-sort; the others neither', async () => {
  const user = userEvent.setup()
  render(<Fruits data={FRUITS} />)
  const name = screen.getByRole('columnheader', { name: /Name/ })
  const colour = screen.getByRole('columnheader', { name: 'Colour' })

  expect(name).toHaveAttribute('aria-sort', 'ascending')
  expect(colour).not.toHaveAttribute('aria-sort')
  expect(within(colour).queryByRole('button')).not.toBeInTheDocument()

  await user.click(within(name).getByRole('button', { name: /Name/ }))

  expect(name).toHaveAttribute('aria-sort', 'descending')
  expect(names()).toEqual(['Pear', 'Apple'])
})

test('shows new data (the table instance itself stays the same)', () => {
  const { rerender } = render(<Fruits data={FRUITS} />)

  rerender(<Fruits data={[...FRUITS, { id: '3', name: 'Banana', colour: 'Yellow' }]} />)

  expect(names()).toEqual(['Apple', 'Banana', 'Pear'])
})
