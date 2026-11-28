import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { createQueryClient } from './api/queryClient'
import './index.css'
import { routes } from './routes'

const router = createBrowserRouter(routes)
// Any 401 (session expired, logged out elsewhere) empties the cache and lands on /login.
const queryClient = createQueryClient({
  onUnauthenticated: () => void router.navigate('/login', { replace: true }),
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
