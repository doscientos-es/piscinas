import { describe, expect, it } from 'vitest'

import { canAccessAppView } from './app-access'

describe('canAccessAppView', () => {
  it('limita la operativa del trabajador a agenda, trabajos e inventario', () => {
    expect(canAccessAppView('technician', 'agenda')).toBe(true)
    expect(canAccessAppView('technician', 'trabajos')).toBe(true)
    expect(canAccessAppView('technician', 'inventario')).toBe(true)
    expect(canAccessAppView('technician', 'clientes')).toBe(false)
    expect(canAccessAppView('technician', 'facturacion')).toBe(false)
    expect(canAccessAppView('technician', 'estadisticas')).toBe(false)
  })

  it('mantiene todos los módulos disponibles para administración', () => {
    expect(canAccessAppView('admin', 'inicio')).toBe(true)
    expect(canAccessAppView('admin', 'trabajos')).toBe(true)
    expect(canAccessAppView('admin', 'estadisticas')).toBe(true)
  })
})