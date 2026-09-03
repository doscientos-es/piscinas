import { describe, expect, it } from 'vitest'

import { getAppRoute } from './app-route'

describe('getAppRoute', () => {
  it('resuelve las vistas estáticas del App Router', () => {
    expect(getAppRoute('/agenda')).toEqual({ view: 'agenda' })
    expect(getAppRoute('/trabajos')).toEqual({ view: 'trabajos' })
    expect(getAppRoute('/inventario')).toEqual({ view: 'inventario' })
    expect(getAppRoute('/estadisticas')).toEqual({ view: 'estadisticas' })
  })

  it('preserva el identificador de un parte en la ruta dinámica', () => {
    expect(getAppRoute('/agenda/0d73fc4a-7498-4a62-b4f6-1b4ec742ef8c')).toEqual({
      view: 'parte',
      visitId: '0d73fc4a-7498-4a62-b4f6-1b4ec742ef8c',
    })
  })
})
