import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { expect, test } from 'vitest'
import { SearchInput } from './SearchInput'

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial)
  return <SearchInput label="Search patients" value={value} onChange={setValue} placeholder="Name" />
}

test('is a labelled search box', async () => {
  const user = userEvent.setup()
  render(<Harness />)
  const input = screen.getByRole('searchbox', { name: 'Search patients' })

  await user.type(input, 'zoe')

  expect(input).toHaveValue('zoe')
  expect(input).toHaveAttribute('placeholder', 'Name')
})

test('offers a clear button only when there is text', async () => {
  const user = userEvent.setup()
  render(<Harness />)
  expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument()

  await user.type(screen.getByRole('searchbox'), 'zoe')

  expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument()
})

test('clearing empties the box and puts the focus back in it', async () => {
  const user = userEvent.setup()
  render(<Harness initial="zoe" />)

  await user.click(screen.getByRole('button', { name: 'Clear search' }))

  expect(screen.getByRole('searchbox')).toHaveValue('')
  expect(screen.getByRole('searchbox')).toHaveFocus()
  expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument()
})

test('Escape clears the box', async () => {
  const user = userEvent.setup()
  render(<Harness initial="zoe" />)

  await user.type(screen.getByRole('searchbox'), '{Escape}')

  expect(screen.getByRole('searchbox')).toHaveValue('')
})
