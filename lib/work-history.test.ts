import { describe, expect, it } from 'vitest'

import {
  canManagePendingWork,
  filterWorkHistory,
  paginateWorkHistory,
  type WorkHistoryVisit,
} from './work-history'

const visits: WorkHistoryVisit[] = [
  {
    id: 'older',
    installation_id: 'installation-1',
    scheduled_for: '2026-08-10T08:00:00.000Z',
    status: 'completed',
    technician_id: 'tech-1',
    technician: { full_name: 'Ana' },
    interventions: { completed_at: '2026-08-10T09:00:00.000Z', notes: 'Limpieza' },
    installations: {
      name: 'Piscina norte',
      address: 'Calle Sol',
      clients: { legal_name: 'Álvaro' },
    },
  },
  {
    id: 'recent',
    installation_id: 'installation-2',
    scheduled_for: '2026-08-20T08:00:00.000Z',
    status: 'cancelled',
    technician_id: 'tech-2',
    technician: { full_name: 'Bruno' },
    interventions: null,
    installations: {
      name: 'Piscina sur',
      address: 'Avenida Mar',
      clients: { legal_name: 'Hotel Azul' },
    },
  },
]

describe('work history', () => {
  it('filtra por texto, estado, técnico y rango de fechas', () => {
    expect(
      filterWorkHistory(visits, {
        query: 'alvaro',
        status: 'completed',
        technicianId: 'tech-1',
        from: '2026-08-01',
        to: '2026-08-15',
      }),
    ).toEqual([visits[0]])
  })

  it('ordena los resultados recientes primero y los pagina', () => {
    const results = filterWorkHistory(visits, {
      query: '',
      status: 'all',
      technicianId: '',
      from: '',
      to: '',
    })
    expect(paginateWorkHistory(results, 0, 1)).toEqual([visits[1]])
    expect(paginateWorkHistory(results, 1, 1)).toEqual([visits[0]])
  })

  it('reserva la edición para administración y trabajos pendientes', () => {
    expect(canManagePendingWork(true, 'scheduled')).toBe(true)
    expect(canManagePendingWork(true, 'in_progress')).toBe(false)
    expect(canManagePendingWork(false, 'scheduled')).toBe(false)
  })
})
