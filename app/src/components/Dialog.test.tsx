import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { expect, test } from 'vitest'
import { Dialog } from './Dialog'

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open && (
        <Dialog title="Add patient" onClose={() => setOpen(false)}>
          <label>
            Family name <input />
          </label>
        </Dialog>
      )}
    </>
  )
}

test('opens a modal dialog named by its title, focused on the first field', async () => {
  const user = userEvent.setup()
  render(<Harness />)

  await user.click(screen.getByRole('button', { name: 'Open' }))

  const dialog = screen.getByRole('dialog', { name: 'Add patient' })
  expect(dialog).toHaveAttribute('open')
  expect(screen.getByLabelText('Family name')).toHaveFocus()
})

test('Escape closes it and gives the focus back to the button that opened it', async () => {
  const user = userEvent.setup()
  render(<Harness />)
  await user.click(screen.getByRole('button', { name: 'Open' }))

  await user.keyboard('{Escape}')

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus()
})

test('has a close button', async () => {
  const user = userEvent.setup()
  render(<Harness />)
  await user.click(screen.getByRole('button', { name: 'Open' }))

  await user.click(screen.getByRole('button', { name: 'Close' }))

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
