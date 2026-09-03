'use client'

import { usePathname } from 'next/navigation'
import { Suspense } from 'react'

import { DemoApp } from '@/components/demo-app'
import { getAppRoute } from '@/lib/app-route'

export function PersistentApp() {
  return (
    <Suspense fallback={<main className="empty-state">S'està carregant l'aplicació…</main>}>
      <PersistentAppContent />
    </Suspense>
  )
}

function PersistentAppContent() {
  const pathname = usePathname()
  const route = getAppRoute(pathname)

  return <DemoApp {...route} />
}
