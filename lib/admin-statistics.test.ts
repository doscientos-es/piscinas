import { describe, expect, it } from 'vitest'

import { buildAdminStatistics, getStatisticsPeriod } from './admin-statistics'

describe('buildAdminStatistics', () => {
  const now = new Date(2026, 8, 20, 12)

  it('uses the current month and five previous months as its reporting period', () => {
    const { start, end } = getStatisticsPeriod(now)

    expect(start).toEqual(new Date(2026, 3, 1))
    expect(end).toEqual(new Date(2026, 9, 1))
  })

  it('aggregates visits, attendance punctuality and invoicing by month', () => {
    const statistics = buildAdminStatistics(
      [
        {
          scheduled_for: '2026-09-10T09:00:00',
          status: 'completed',
          interventions: [{ started_at: '2026-09-10T09:08:00' }],
        },
        {
          scheduled_for: '2026-09-12T09:00:00',
          status: 'in_progress',
          interventions: [{ started_at: '2026-09-12T10:45:00' }],
        },
        {
          scheduled_for: '2026-03-30T09:00:00',
          status: 'completed',
          interventions: [],
        },
      ],
      [
        { issued_on: '2026-09-04', status: 'paid', total: 121 },
        { issued_on: '2026-09-18', status: 'issued', total: 80 },
        { issued_on: '2026-09-19', status: 'void', total: 25 },
      ],
      now,
    )

    expect(statistics.totals).toEqual({
      planned: 2,
      completed: 1,
      started: 2,
      invoiced: 201,
      collected: 121,
    })
    expect(statistics.status).toMatchObject({ completed: 1, in_progress: 1 })
    expect(statistics.punctuality).toEqual({ early: 0, onTime: 1, late: 0, exception: 1 })
  })
})