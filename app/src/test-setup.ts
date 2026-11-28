import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

// jsdom has no <dialog> modal API: a minimal stand-in (browsers use the native one).
HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
  this.open = true
}
HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
  this.open = false
  this.dispatchEvent(new Event('close'))
}

// jsdom has no matchMedia: default to a larger screen (tests switch with setScreen()).
beforeEach(() => {
  window.matchMedia = ((media: string) => ({
    matches: media.includes('min-width'),
    media,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
})

afterEach(() => {
  cleanup()
  // Each test starts without cookies (the CSRF cookie set by a stubbed /api/auth/csrf/).
  for (const cookie of document.cookie.split('; ').filter(Boolean)) {
    document.cookie = `${cookie.split('=')[0]}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`
  }
})
