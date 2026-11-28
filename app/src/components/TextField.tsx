import type { ReactNode } from 'react'

/** A labelled input with its error linked for screen readers (React 19: `ref` is a prop). */
export function TextField({
  id,
  label,
  error,
  ...input
}: { id: string; label: ReactNode; error?: string } & React.ComponentProps<'input'>) {
  const errorId = `${id}-error`
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`min-h-11 w-full rounded-md border bg-white px-3 text-base ${
          error ? 'border-brick' : 'border-line'
        }`}
        {...input}
      />
      {error && (
        <p id={errorId} className="text-sm text-brick">
          {error}
        </p>
      )}
    </div>
  )
}
