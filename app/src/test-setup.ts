import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
  // Each test starts without cookies (the CSRF cookie set by a stubbed /api/auth/csrf/).
  for (const cookie of document.cookie.split('; ').filter(Boolean)) {
    document.cookie = `${cookie.split('=')[0]}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`
  }
})
