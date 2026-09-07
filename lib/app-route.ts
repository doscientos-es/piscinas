export type AppView =
  | 'inicio'
  | 'agenda'
  | 'trabajos'
  | 'clientes'
  | 'facturacion'
  | 'inventario'
  | 'estadisticas'
  | 'parte'

export type AppRoute =
  | { view: 'inicio' }
  | { view: 'agenda' }
  | { view: 'trabajos' }
  | { view: 'clientes' }
  | { view: 'facturacion' }
  | { view: 'inventario' }
  | { view: 'estadisticas' }
  | { view: 'parte'; visitId: string; backHref: '/agenda' | '/trabajos' }

export function getAppRoute(pathname: string): AppRoute {
  if (pathname === '/agenda') return { view: 'agenda' }
  if (pathname === '/trabajos') return { view: 'trabajos' }
  if (pathname === '/clientes') return { view: 'clientes' }
  if (pathname === '/facturacion') return { view: 'facturacion' }
  if (pathname === '/inventario') return { view: 'inventario' }
  if (pathname === '/estadisticas') return { view: 'estadisticas' }

  const agendaVisitId = /^\/agenda\/([^/]+)$/.exec(pathname)?.[1]
  if (agendaVisitId) return { view: 'parte', visitId: agendaVisitId, backHref: '/agenda' }

  const workVisitId = /^\/trabajos\/([^/]+)$/.exec(pathname)?.[1]
  if (workVisitId) return { view: 'parte', visitId: workVisitId, backHref: '/trabajos' }

  return { view: 'inicio' }
}
