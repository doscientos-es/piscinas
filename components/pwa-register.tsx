'use client'

import { registerPwaServiceWorker } from '@doscientos/pwa/core'
import { useEffect } from 'react'

/** Registers the app-owned, privacy-safe service worker once. */
export function PwaRegister() {
  useEffect(() => registerPwaServiceWorker(), [])

  return null
}