'use client'

import { registerPwaServiceWorker } from '@doscientos/pwa/core'
import { useEffect } from 'react'

/** Registers Concepte Blau's app-owned, privacy-safe service worker once. */
export function PwaRegister() {
  useEffect(() => registerPwaServiceWorker(), [])

  return null
}