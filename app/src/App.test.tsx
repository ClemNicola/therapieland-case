import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import App from './App'

function renderApp() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  )
}

test('shows the API health status', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ status: 'ok' }, { status: 200 })),
  )

  renderApp()

  expect(await screen.findByText('ok')).toBeInTheDocument()
  expect(fetch).toHaveBeenCalledWith('/api/health/', expect.anything())
})

test('reports an unreachable API', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

  renderApp()

  expect(await screen.findByText('unreachable')).toBeInTheDocument()
})
