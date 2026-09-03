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
  | { view: 'parte'; visitId: string }

export function getAppRoute(pathname: string): AppRoute {
  if (pathname === '/agenda') return { view: 'agenda' }
  if (pathname === '/trabajos') return { view: 'trabajos' }
  if (pathname === '/clientes') return { view: 'clientes' }
  if (pathname === '/facturacion') return { view: 'facturacion' }
  if (pathname === '/inventario') return { view: 'inventario' }
  if (pathname === '/estadisticas') return { view: 'estadisticas' }

  const visitId = /^\/agenda\/([^/]+)$/.exec(pathname)?.[1]
  if (visitId) return { view: 'parte', visitId }

  return { view: 'inicio' }
}
