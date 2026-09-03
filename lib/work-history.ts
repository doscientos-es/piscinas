export type WorkHistoryVisit = {
  id: string
  installation_id: string
  scheduled_for: string
  status: string
  planning_notes: string | null
  technician_id: string | null
  technician: { full_name: string } | null
  installations: { name: string; address: string; clients: { legal_name: string } | null } | null
  interventions: { completed_at: string | null; notes: string | null } | null
}

export type WorkInstallation = {
  id: string
  name: string
  address: string
  clientId: string
  clientName: string
}
export type WorkClient = {
  id: string
  name: string
  installations: WorkInstallation[]
}
export type WorkTechnician = { id: string; full_name: string }
export type PendingWorkInput = {
  installationId: string
  technicianId: string
  scheduledFor: string
  planningNotes: string
}

export function canManagePendingWork(isAdmin: boolean, status: string) {
  return isAdmin && status === 'scheduled'
}

export type WorkHistoryFilters = {
  query: string
  status: string
  technicianId: string
  from: string
  to: string
}

export function filterWorkHistory(visits: WorkHistoryVisit[], filters: WorkHistoryFilters) {
  const query = normalize(filters.query)
  return visits
    .filter((visit) => {
      const scheduledDate = visit.scheduled_for.slice(0, 10)
      const searchable = [
        visit.installations?.clients?.legal_name,
        visit.installations?.name,
        visit.installations?.address,
        visit.technician?.full_name,
        visit.planning_notes,
        visit.interventions?.notes,
      ]
        .filter(Boolean)
        .join(' ')
      return (
        (!query || normalize(searchable).includes(query)) &&
        (filters.status === 'all' || visit.status === filters.status) &&
        (!filters.technicianId || visit.technician_id === filters.technicianId) &&
        (!filters.from || scheduledDate >= filters.from) &&
        (!filters.to || scheduledDate <= filters.to)
      )
    })
    .sort((left, right) => right.scheduled_for.localeCompare(left.scheduled_for))
}

export function paginateWorkHistory<T>(items: T[], page: number, pageSize: number) {
  return items.slice(page * pageSize, (page + 1) * pageSize)
}

export function groupWorkInstallationsByClient(installations: WorkInstallation[]): WorkClient[] {
  const clients = new Map<string, WorkClient>()
  for (const installation of installations) {
    const client = clients.get(installation.clientId) ?? {
      id: installation.clientId,
      name: installation.clientName,
      installations: [],
    }
    client.installations.push(installation)
    clients.set(client.id, client)
  }
  return Array.from(clients.values())
    .map((client) => ({
      ...client,
      installations: [...client.installations].sort((left, right) =>
        `${left.name} ${left.address}`.localeCompare(`${right.name} ${right.address}`, 'es'),
      ),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, 'es'))
}

export function normalizeWorkPlanningNotes(value: string) {
  return value.trim() || null
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}
