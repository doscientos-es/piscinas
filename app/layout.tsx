import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import type { ReactNode } from 'react'

import { PersistentApp } from '@/components/persistent-app'
import { PwaInstallPrompt } from '@/components/pwa-install-prompt'
import { PwaRegister } from '@/components/pwa-register'

import './globals.css'

const geist = Geist({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-geist',
})

export const metadata: Metadata = {
  title: { default: 'Gestión de piscinas', template: '%s · Gestión de piscinas' },
  description: 'Gestión del mantenimiento, visitas, clientes y facturación de piscinas.',
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#f7f8fc' }

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es" className={geist.variable}>
      <body>
        <PersistentApp />
        <div hidden>{children}</div>
        <PwaRegister />
        <PwaInstallPrompt />
      </body>
    </html>
  )
}
