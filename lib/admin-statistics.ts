export type StatisticsVisit = {
  scheduled_for: string
  status: string
  technician: { full_name: string | null } | null
  interventions:
    | { started_at: string | null; completed_at: string | null }
    | { started_at: string | null; completed_at: string | null }[]
    | null
}

export type StatisticsInvoice = {
  issued_on: string | null
  status: string
  total: number | string
}

type MonthMetric = {
  key: string
  label: string
  planned: number
  completed: number
  invoiced: number
  collected: number
}

export type AdminStatistics = {
  months: MonthMetric[]
  status: Record<'scheduled' | 'in_progress' | 'completed' | 'cancelled', number>
  punctuality: { early: number; onTime: number; late: number; exception: number }
  technicianDurations: {
    technicianName: string
    completedVisits: number
    totalMinutes: number
    averageMinutes: number
  }[]
  duration: { completedVisits: number; totalMinutes: number; averageMinutes: number | null }
  totals: {
    planned: number
    completed: number
    started: number
    invoiced: number
    collected: number
  }
}

const visitStatuses = ['scheduled', 'in_progress', 'completed', 'cancelled'] as const

export function getStatisticsPeriod(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return { start, end }
}

export function buildAdminStatistics(
  visits: StatisticsVisit[],
  invoices: StatisticsInvoice[],
  now = new Date(),
): AdminStatistics {
  const { start, end } = getStatisticsPeriod(now)
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth() + index, 1)
    return {
      key: monthKey(date),
      label: new Intl.DateTimeFormat('ca-ES', { month: 'short' }).format(date),
      planned: 0,
      completed: 0,
      invoiced: 0,
      collected: 0,
    }
  })
  const byMonth = new Map(months.map((month) => [month.key, month]))
  const status = { scheduled: 0, in_progress: 0, completed: 0, cancelled: 0 }
  const punctuality = { early: 0, onTime: 0, late: 0, exception: 0 }
  const durationByTechnician = new Map<string, { completedVisits: number; totalMinutes: number }>()

  for (const visit of visits) {
    const scheduledFor = new Date(visit.scheduled_for)
    if (!isInPeriod(scheduledFor, start, end)) continue
    const month = byMonth.get(monthKey(scheduledFor))
    if (!month) continue

    month.planned += 1
    if (isVisitStatus(visit.status)) status[visit.status] += 1
    if (visit.status === 'completed') month.completed += 1

    const intervention = Array.isArray(visit.interventions)
      ? visit.interventions[0]
      : visit.interventions
    const startedAt = intervention?.started_at
    if (!startedAt) continue
    const deltaMinutes = (new Date(startedAt).getTime() - scheduledFor.getTime()) / 60_000
    if (deltaMinutes < -15) punctuality.early += 1
    else if (Math.abs(deltaMinutes) <= 15) punctuality.onTime += 1
    else if (Math.abs(deltaMinutes) <= 90) punctuality.late += 1
    else punctuality.exception += 1

    const durationMinutes = getCompletedVisitDurationMinutes(
      visit.status,
      startedAt,
      intervention?.completed_at,
    )
    const technicianName = visit.technician?.full_name?.trim()
    if (durationMinutes === null || !technicianName) continue
    const duration = durationByTechnician.get(technicianName) ?? {
      completedVisits: 0,
      totalMinutes: 0,
    }
    duration.completedVisits += 1
    duration.totalMinutes += durationMinutes
    durationByTechnician.set(technicianName, duration)
  }

  for (const invoice of invoices) {
    if (!invoice.issued_on) continue
    const issuedOn = new Date(`${invoice.issued_on}T12:00:00`)
    if (!isInPeriod(issuedOn, start, end) || ['draft', 'void'].includes(invoice.status)) continue
    const month = byMonth.get(monthKey(issuedOn))
    if (!month) continue
    const total = Number(invoice.total)
    if (!Number.isFinite(total)) continue
    month.invoiced += total
    if (invoice.status === 'paid') month.collected += total
  }

  const technicianDurations = [...durationByTechnician.entries()]
    .map(([technicianName, duration]) => ({
      technicianName,
      ...duration,
      averageMinutes: Math.round(duration.totalMinutes / duration.completedVisits),
    }))
    .sort(
      (first, second) =>
        second.averageMinutes - first.averageMinutes ||
        first.technicianName.localeCompare(second.technicianName, 'ca'),
    )
  const duration = technicianDurations.reduce(
    (total, technician) => ({
      completedVisits: total.completedVisits + technician.completedVisits,
      totalMinutes: total.totalMinutes + technician.totalMinutes,
    }),
    { completedVisits: 0, totalMinutes: 0 },
  )

  return {
    months,
    status,
    punctuality,
    technicianDurations,
    duration: {
      ...duration,
      averageMinutes: duration.completedVisits
        ? Math.round(duration.totalMinutes / duration.completedVisits)
        : null,
    },
    totals: {
      planned: months.reduce((total, month) => total + month.planned, 0),
      completed: months.reduce((total, month) => total + month.completed, 0),
      started: Object.values(punctuality).reduce((total, value) => total + value, 0),
      invoiced: months.reduce((total, month) => total + month.invoiced, 0),
      collected: months.reduce((total, month) => total + month.collected, 0),
    },
  }
}

function isVisitStatus(status: string): status is (typeof visitStatuses)[number] {
  return visitStatuses.includes(status as (typeof visitStatuses)[number])
}

function isInPeriod(date: Date, start: Date, end: Date) {
  return !Number.isNaN(date.getTime()) && date >= start && date < end
}

function getCompletedVisitDurationMinutes(
  status: string,
  startedAt: string,
  completedAt: string | null | undefined,
) {
  if (status !== 'completed' || !completedAt) return null
  const startedTime = new Date(startedAt).getTime()
  const completedTime = new Date(completedAt).getTime()
  if (Number.isNaN(startedTime) || Number.isNaN(completedTime) || completedTime < startedTime) {
    return null
  }
  return Math.round((completedTime - startedTime) / 60_000)
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}
