import { useEffect, useId, useRef, type ReactNode } from 'react'

/**
 * A modal dialog on the native <dialog> (showModal): focus trapped inside, background inert,
 * Escape closes it, and the focus goes back to what opened it. Render it to open it.
 * The first field gets the focus, or the element marked `data-autofocus`. On close, the focus
 * returns to the opener, or to the page's <h1> (give it tabIndex={-1}) if the opener is gone.
 */
export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal()
    dialog.querySelector<HTMLElement>('[data-autofocus], input, select, textarea')?.focus()
    return () => {
      if (dialog.open) dialog.close()
      // The opener may be gone (e.g. its row was removed): fall back to the page heading.
      const target = opener?.isConnected ? opener : document.querySelector<HTMLElement>('main h1')
      target?.focus()
    }
  }, [])

  const cancel = (event: { preventDefault: () => void }) => {
    event.preventDefault() // React owns whether the dialog is rendered
    onClose()
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={cancel}
      onKeyDown={(event) => event.key === 'Escape' && cancel(event)}
      className="m-auto max-h-[calc(100svh-2rem)] w-[calc(100%-2rem)] max-w-lg rounded-lg bg-mist p-0 text-ink backdrop:bg-ink/40"
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
        <h2 id={titleId} className="pt-2 text-xl font-semibold tracking-tight">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-2 grid size-11 shrink-0 place-items-center rounded-md text-muted hover:text-ink"
        >
          <span aria-hidden="true" className="text-2xl leading-none">
            ×
          </span>
        </button>
      </div>
      <div className="px-6 py-5">{children}</div>
    </dialog>
  )
}
