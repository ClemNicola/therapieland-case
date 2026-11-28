import { act, renderHook } from '@testing-library/react'
import { expect, test } from 'vitest'
import { useMediaQuery } from './useMediaQuery'

test('follows the media query as the viewport changes', () => {
  let listener: (() => void) | undefined
  let matches = false
  window.matchMedia = ((media: string) => ({
    get matches() {
      return matches
    },
    media,
    addEventListener: (_: string, l: () => void) => (listener = l),
    removeEventListener: () => (listener = undefined),
  })) as unknown as typeof window.matchMedia

  const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))
  expect(result.current).toBe(false)

  act(() => {
    matches = true
    listener?.()
  })
  expect(result.current).toBe(true)
})
