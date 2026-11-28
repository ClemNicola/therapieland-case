import { useId, useRef } from 'react'

/** A labelled search box with a clear button (also cleared with Escape). */
export function SearchInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const clear = () => {
    onChange('')
    input.current?.focus()
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          ref={input}
          id={id}
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => event.key === 'Escape' && clear()}
          placeholder={placeholder}
          autoComplete="off"
          // Hide the browser's own clear icon: ours is labelled and keyboard reachable.
          className="min-h-11 w-full rounded-md border border-line bg-white pr-11 pl-3 text-base [&::-webkit-search-cancel-button]:appearance-none"
        />
        {value && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-md text-muted hover:text-ink"
          >
            <span aria-hidden="true" className="text-xl leading-none">
              ×
            </span>
          </button>
        )}
      </div>
    </div>
  )
}
