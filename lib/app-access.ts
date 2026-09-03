import type { AppView } from './app-route'

export type AccountRole = 'admin' | 'technician' | 'accounting'

const operationalViews: AppView[] = ['agenda', 'trabajos', 'inventario', 'parte']

export function canAccessAppView(role: AccountRole, view: AppView) {
  return role === 'admin' || operationalViews.includes(view)
}