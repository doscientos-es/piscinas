'use client'

import { usePwaInstallPrompt } from '@doscientos/pwa/react'
import { Download, Share2, X } from 'lucide-react'

const DISMISS_KEY = 'pool-operations:pwa-install-dismissed'

/** Offers installation only when the browser exposes a safe install path. */
export function PwaInstallPrompt() {
  const { dismiss, install, isIos, pending, visible } = usePwaInstallPrompt({
    storageKey: DISMISS_KEY,
  })

  if (!visible) return null

  return (
    <aside className="pwa-install-prompt" aria-label="Instal·la l'aplicació">
      <div className="pwa-install-icon" aria-hidden="true">
        {isIos ? <Share2 size={20} /> : <Download size={20} />}
      </div>
      <div className="pwa-install-content">
        <strong>{isIos ? "Afegeix l'aplicació a l'inici" : "Instal·la l'aplicació"}</strong>
        <p>
          {isIos
            ? 'A Safari, toca Compartir i selecciona «Afegeix a la pantalla d’inici».'
            : 'Obre-la com una aplicació per consultar la teva operativa més de pressa.'}
        </p>
      </div>
      <div className="pwa-install-actions">
        {!isIos && (
          <button
            type="button"
            className="pwa-install-action"
            disabled={pending}
            onClick={() => void install()}
          >
            {pending ? "S'està obrint…" : 'Instal·la'}
          </button>
        )}
        <button
          type="button"
          className="pwa-install-dismiss"
          onClick={dismiss}
          aria-label="Descarta l'avís d'instal·lació"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
    </aside>
  )
}
