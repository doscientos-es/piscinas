'use client'

import { usePwaInstallPrompt } from '@doscientos/pwa/react'
import { Download, Share2, X } from 'lucide-react'

const DISMISS_KEY = 'concepte-blau:pwa-install-dismissed'

/** Offers installation only when the browser exposes a safe install path. */
export function PwaInstallPrompt() {
  const { dismiss, install, isIos, pending, visible } = usePwaInstallPrompt({
    storageKey: DISMISS_KEY,
  })

  if (!visible) return null

  return (
    <aside className="pwa-install-prompt" aria-label="Instalar Concepte Blau">
      <div className="pwa-install-icon" aria-hidden="true">
        {isIos ? <Share2 size={20} /> : <Download size={20} />}
      </div>
      <div className="pwa-install-content">
        <strong>{isIos ? 'Añade Concepte Blau a tu inicio' : 'Instala Concepte Blau'}</strong>
        <p>
          {isIos
            ? 'En Safari, toca Compartir y selecciona «Añadir a pantalla de inicio».'
            : 'Ábrelo como una app para consultar tu operativa más rápido.'}
        </p>
      </div>
      <div className="pwa-install-actions">
        {!isIos && (
          <button type="button" className="pwa-install-action" disabled={pending} onClick={() => void install()}>
            {pending ? 'Abriendo…' : 'Instalar'}
          </button>
        )}
        <button
          type="button"
          className="pwa-install-dismiss"
          onClick={dismiss}
          aria-label="Descartar aviso de instalación"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
    </aside>
  )
}