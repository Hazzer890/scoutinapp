import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConvexAuthProvider } from '@convex-dev/auth/react'
import { ConvexReactClient } from 'convex/react'
import { ThemeProvider } from 'next-themes'
import { RouterProvider } from 'react-router'
import { registerSW } from 'virtual:pwa-register'
import { Toaster } from '@/components/ui/sonner'
import { router } from '@/router'
import './index.css'

// The app sits open on phones all day at an event, and the browser only checks
// for a new service worker on navigation — poll so deploys land within minutes.
registerSW({
  onRegisteredSW(_url, registration) {
    setInterval(() => void registration?.update(), 5 * 60 * 1000)
  },
})

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConvexAuthProvider client={convex}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <RouterProvider router={router} />
        <Toaster />
      </ThemeProvider>
    </ConvexAuthProvider>
  </StrictMode>,
)
