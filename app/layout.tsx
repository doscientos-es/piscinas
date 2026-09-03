import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

import { PersistentApp } from '@/components/persistent-app'
import { PwaInstallPrompt } from '@/components/pwa-install-prompt'
import { PwaRegister } from '@/components/pwa-register'

import './globals.css'

export const metadata: Metadata = {
  title: { default: 'Concepte Blau · Gestió de piscines', template: '%s · Concepte Blau' },
  description: 'Gestió del manteniment, visites, clients i facturació de piscines.',
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#2a4227' }

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ca">
      <body>
        <PersistentApp />
        <div hidden>{children}</div>
        <PwaRegister />
        <PwaInstallPrompt />
      </body>
    </html>
  )
}
