import { Outlet } from 'react-router'
import { Balatro } from '@/components/reactbits/balatro'
import { CardNav } from '@/components/card-nav'

export function RootLayout() {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <div className="fixed inset-0" aria-hidden>
        <Balatro
          isRotate={false}
          mouseInteraction={false}
          color1="#ec0080"
          color2="#99003f"
          color3="#0d0105"
        />
        {/* Mutes the shader so page content stays readable. */}
        <div className="absolute inset-0 bg-background/80" />
      </div>
      <CardNav />
      <main className="relative p-4 pt-24 sm:p-6 sm:pt-28">
        <Outlet />
      </main>
    </div>
  )
}
