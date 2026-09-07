'use client'

import { Toaster } from '@doscientos/ui'
import { usePathname } from 'next/navigation'
import { Suspense } from 'react'

import { DemoApp } from '@/components/demo-app'
import { getAppRoute } from '@/lib/app-route'

export function PersistentApp() {
  return (
    <>
      <Suspense fallback={<main className="empty-state">S'està carregant l'aplicació…</main>}>
        <PersistentAppContent />
      </Suspense>
      <Toaster position="bottom-right" />
    </>
  )
}

function PersistentAppContent() {
  const pathname = usePathname()
  const route = getAppRoute(pathname)

  return <DemoApp {...route} />
}
