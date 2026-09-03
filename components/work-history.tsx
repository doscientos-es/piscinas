'use client'

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@doscientos/ui'
import { CalendarDays, Pencil, Plus, Search, Trash2, UserRound } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useMemo, useState } from 'react'

import type { SearchParamUpdates } from '@/lib/search-params'
import { usePersistentSearchParams } from '@/lib/use-persistent-search-params'
import {
  canManagePendingWork,
  filterWorkHistory,
  groupWorkInstallationsByClient,
  paginateWorkHistory,
  type PendingWorkInput,
  type WorkClient,
  type WorkHistoryVisit,
  type WorkInstallation,
  type WorkTechnician,
} from '@/lib/work-history'

const pageSize = 10

type WorkHistoryProps = {
  visits: WorkHistoryVisit[]
  installations: WorkInstallation[]
  technicians: WorkTechnician[]
  isAdmin: boolean
  onSavePendingWork: (input: PendingWorkInput, id?: string) => Promise<void>
  onDeletePendingWork: (id: string) => Promise<void>
}

export function WorkHistory({
  visits,
  installations,
  technicians,
  isAdmin,
  onSavePendingWork,
  onDeletePendingWork,
}: WorkHistoryProps) {
  const searchParams = useSearchParams()
  const updateSearchParams = usePersistentSearchParams()
  const query = searchParams.get('q') ?? ''
  const statusParam = searchParams.get('estado')
  const status =
    statusParam === 'all' ||
    statusParam === 'completed' ||
    statusParam === 'in_progress' ||
    statusParam === 'scheduled' ||
    statusParam === 'cancelled'
      ? statusParam
      : isAdmin
        ? 'scheduled'
        : 'completed'
  const technicianId = searchParams.get('tecnico') ?? ''
  const from = searchParams.get('desde') ?? ''
  const to = searchParams.get('hasta') ?? ''
  const requestedPage = Number(searchParams.get('pagina') ?? '1')
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage - 1 : 0
  const [editingVisit, setEditingVisit] = useState<WorkHistoryVisit | 'new' | null>(null)
  const [operationError, setOperationError] = useState<string | null>(null)
  const filterTechnicians = useMemo(() => {
    const names = new Map<string, string>()
    for (const technician of technicians) names.set(technician.id, technician.full_name)
    for (const visit of visits) {
      if (visit.technician_id && visit.technician)
        names.set(visit.technician_id, visit.technician.full_name)
    }
    return Array.from(names.entries())
  }, [technicians, visits])
  const results = filterWorkHistory(visits, { query, status, technicianId, from, to })
  const pageCount = Math.max(1, Math.ceil(results.length / pageSize))
  const currentPage = Math.min(page, pageCount - 1)
  const visibleVisits = paginateWorkHistory(results, currentPage, pageSize)
  const updateFilters = (updates: SearchParamUpdates) =>
    updateSearchParams({ ...updates, pagina: null })
  const changePage = (nextPage: number) =>
    updateSearchParams({ pagina: nextPage > 0 ? nextPage + 1 : null })

  return (
    <section className="work-history" aria-label="Feines">
      <header className="work-history-heading">
        <div>
          <h2>Feines</h2>
        </div>
        <div className="work-history-heading-actions">
          {isAdmin && (
            <button
              className="button"
              type="button"
              onClick={() => {
                setOperationError(null)
                setEditingVisit('new')
              }}
            >
              <Plus size={16} aria-hidden="true" />
              Feina nova
            </button>
          )}
        </div>
      </header>
      <div className="work-history-filters">
        <label className="client-search">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">Cerca feines</span>
          <input
            value={query}
            onChange={(event) => {
              updateFilters({ q: event.target.value })
            }}
            placeholder="Client, instal·lació o informe"
          />
        </label>
        <select
          aria-label="Estat"
          value={status}
          onChange={(event) => {
            updateFilters({ estado: event.target.value })
          }}
        >
          <option value="completed">Finalitzades</option>
          <option value="all">Tots els estats</option>
          <option value="in_progress">En curs</option>
          <option value="scheduled">Programades</option>
          <option value="cancelled">Cancel·lades</option>
        </select>
        {isAdmin && (
          <select
            aria-label="Tècnic"
            value={technicianId}
            onChange={(event) => {
              updateFilters({ tecnico: event.target.value })
            }}
          >
            <option value="">Tot l'equip</option>
            {filterTechnicians.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        )}
        <label>
          Des de
          <input
            aria-label="Des de"
            type="date"
            value={from}
            onChange={(event) => {
              updateFilters({ desde: event.target.value })
            }}
          />
        </label>
        <label>
          Fins a
          <input
            aria-label="Fins a"
            type="date"
            value={to}
            onChange={(event) => {
              updateFilters({ hasta: event.target.value })
            }}
          />
        </label>
      </div>
      <div className="work-history-list" role="list">
        {visibleVisits.map((visit) => (
          <article className="work-history-row" key={visit.id} role="listitem">
            <time>
              <CalendarDays size={16} aria-hidden="true" />
              {new Intl.DateTimeFormat('ca-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(
                new Date(visit.scheduled_for),
              )}
            </time>
            <div>
              <strong>{visit.installations?.clients?.legal_name ?? 'Client'}</strong>
              <span>
                {visit.installations?.name ?? 'Instal·lació'} ·{' '}
                {visit.installations?.address ?? 'Sense adreça'}
              </span>
              {visit.planning_notes && <small>Planificació: {visit.planning_notes}</small>}
              {visit.interventions?.notes && <small>{visit.interventions.notes}</small>}
            </div>
            {isAdmin && (
              <span className="work-history-technician">
                <UserRound size={15} aria-hidden="true" />
                {visit.technician?.full_name ?? 'Sense assignar'}
              </span>
            )}
            <span
              className={`badge ${visit.status === 'completed' ? 'paid' : visit.status === 'cancelled' ? 'pending' : ''}`}
            >
              {statusLabel(visit.status)}
            </span>
            {canManagePendingWork(isAdmin, visit.status) ? (
              <div className="work-history-actions">
                <button
                  className="action-link"
                  type="button"
                  onClick={() => {
                    setOperationError(null)
                    setEditingVisit(visit)
                  }}
                >
                  <Pencil size={15} aria-hidden="true" />
                  Edita
                </button>
                <button
                  className="action-link danger"
                  type="button"
                  onClick={() => {
                    if (
                      !window.confirm(
                        'Voleu eliminar aquesta feina programada? Aquesta acció no es pot desfer.',
                      )
                    )
                      return
                    setOperationError(null)
                    void onDeletePendingWork(visit.id).catch((error: unknown) => {
                      setOperationError(
                        error instanceof Error ? error.message : "No s'ha pogut eliminar la feina.",
                      )
                    })
                  }}
                >
                  <Trash2 size={15} aria-hidden="true" />
                  Elimina
                </button>
              </div>
            ) : visit.status !== 'scheduled' ? (
              <Link className="action-link" href={`/agenda/${visit.id}`}>
                {visit.status === 'completed' ? 'Veure informe' : 'Veure'}
              </Link>
            ) : (
              <span className="muted">Pendent</span>
            )}
          </article>
        ))}
      </div>
      {operationError && <p className="form-error">{operationError}</p>}
      {visibleVisits.length === 0 && (
        <div className="empty-results">
          <CalendarDays size={25} aria-hidden="true" />
          <p>No hi ha feines que coincideixin amb els filtres.</p>
        </div>
      )}
      <nav className="pagination" aria-label="Paginació de feines">
        <button
          className="button secondary"
          type="button"
          disabled={currentPage === 0}
          onClick={() => changePage(currentPage - 1)}
        >
          Anterior
        </button>
        <span>
          Pàgina {currentPage + 1} de {pageCount}
        </span>
        <button
          className="button secondary"
          type="button"
          disabled={currentPage + 1 >= pageCount}
          onClick={() => changePage(currentPage + 1)}
        >
          Següent
        </button>
      </nav>
      {editingVisit && (
        <WorkEditor
          key={editingVisit === 'new' ? 'new' : editingVisit.id}
          visit={editingVisit}
          installations={installations}
          technicians={technicians}
          onClose={() => setEditingVisit(null)}
          onSave={async (input) => {
            await onSavePendingWork(input, editingVisit === 'new' ? undefined : editingVisit.id)
            setEditingVisit(null)
          }}
        />
      )}
    </section>
  )
}

function WorkEditor({
  visit,
  installations,
  technicians,
  onClose,
  onSave,
}: {
  visit: WorkHistoryVisit | 'new'
  installations: WorkInstallation[]
  technicians: WorkTechnician[]
  onClose: () => void
  onSave: (input: PendingWorkInput) => Promise<void>
}) {
  const initialInstallation =
    visit === 'new' ? undefined : installations.find((item) => item.id === visit.installation_id)
  const [installationId, setInstallationId] = useState(visit === 'new' ? '' : visit.installation_id)
  const [selectedClientId, setSelectedClientId] = useState(initialInstallation?.clientId ?? '')
  const [clientSearch, setClientSearch] = useState(initialInstallation?.clientName ?? '')
  const [technicianId, setTechnicianId] = useState(
    visit === 'new' ? (technicians[0]?.id ?? '') : (visit.technician_id ?? ''),
  )
  const [scheduledFor, setScheduledFor] = useState(
    visit === 'new' ? '' : toDateTimeLocal(visit.scheduled_for),
  )
  const [planningNotes, setPlanningNotes] = useState(
    visit === 'new' ? '' : (visit.planning_notes ?? ''),
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const clients = useMemo(() => groupWorkInstallationsByClient(installations), [installations])
  const selectedClient = clients.find((client) => client.id === selectedClientId)
  const matchingClients = clients.filter((client) =>
    client.name.toLocaleLowerCase('es').includes(clientSearch.toLocaleLowerCase('es').trim()),
  )
  const unavailable = !installationId || !technicianId

  const selectClient = (client: WorkClient) => {
    setSelectedClientId(client.id)
    setClientSearch(client.name)
    setInstallationId(client.installations.length === 1 ? client.installations[0].id : '')
  }

  const updateClientSearch = (value: string) => {
    setClientSearch(value)
    if (value !== selectedClient?.name) {
      setSelectedClientId('')
      setInstallationId('')
    }
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (unavailable) return
    setSaving(true)
    setError(null)
    try {
      await onSave({ installationId, technicianId, scheduledFor, planningNotes })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No s'ha pogut desar la feina.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="work-editor-dialog sm:max-w-2xl">
        <DialogHeader className="work-editor-dialog-header">
          <DialogTitle>{visit === 'new' ? 'Feina nova' : 'Edita la feina'}</DialogTitle>
          <DialogDescription>
            Assigna el client, la instal·lació i la persona responsable de la visita.
          </DialogDescription>
        </DialogHeader>
        <form className="record-form" onSubmit={(event) => void submit(event)}>
          <div className="form-grid">
            <div className="field form-span-2 work-client-picker">
              <span>Client</span>
              <input
                type="search"
                value={clientSearch}
                onChange={(event) => updateClientSearch(event.target.value)}
                placeholder="Cerca pel nom del client"
                aria-label="Cerca un client"
                autoComplete="off"
              />
              {selectedClient ? (
                <div className="work-client-selected">
                  <span>
                    <strong>{selectedClient.name}</strong>
                    <small>
                      {selectedClient.installations.length}{' '}
                      {selectedClient.installations.length === 1
                        ? 'instal·lació'
                        : 'instal·lacions'}
                    </small>
                  </span>
                  <button
                    type="button"
                    className="action-link"
                    onClick={() => updateClientSearch('')}
                  >
                    Canvia
                  </button>
                </div>
              ) : clientSearch.trim() ? (
                <div className="work-client-options" aria-label="Clients trobats">
                  {matchingClients.length ? (
                    matchingClients.map((client) => (
                      <button
                        type="button"
                        className="work-client-option"
                        key={client.id}
                        onClick={() => selectClient(client)}
                      >
                        <strong>{client.name}</strong>
                        <small>
                          {client.installations.length}{' '}
                          {client.installations.length === 1 ? 'instal·lació' : 'instal·lacions'}
                        </small>
                      </button>
                    ))
                  ) : (
                    <p>No hi ha clients que coincideixin amb la cerca.</p>
                  )}
                </div>
              ) : (
                <p className="work-client-hint">
                  Cerca i selecciona el client abans de triar la instal·lació.
                </p>
              )}
            </div>
            {selectedClient?.installations.length === 1 ? (
              <div className="field form-span-2">
                <span>Instal·lació</span>
                <div className="work-installation-selected">
                  <strong>{selectedClient.installations[0].name}</strong>
                  <small>{selectedClient.installations[0].address}</small>
                </div>
              </div>
            ) : selectedClient ? (
              <label className="field form-span-2">
                <span>Instal·lació</span>
                <select
                  value={installationId}
                  onChange={(event) => setInstallationId(event.target.value)}
                  required
                >
                  <option value="" disabled>
                    Selecciona una instal·lació
                  </option>
                  {selectedClient.installations.map((installation) => (
                    <option key={installation.id} value={installation.id}>
                      {installation.name} · {installation.address}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="field form-span-2 work-installation-prompt">
                <span>Instal·lació</span>
                <p>Selecciona primer un client.</p>
              </div>
            )}
            <label className="field">
              <span>Tècnic</span>
              <select
                value={technicianId}
                onChange={(event) => setTechnicianId(event.target.value)}
                required
              >
                <option value="" disabled>
                  Selecciona un tècnic
                </option>
                {technicians.map((technician) => (
                  <option key={technician.id} value={technician.id}>
                    {technician.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field form-span-2">
              <span>Data i hora</span>
              <input
                type="datetime-local"
                value={scheduledFor}
                onChange={(event) => setScheduledFor(event.target.value)}
                required
              />
            </label>
            <label className="field form-span-2">
              <span>
                Notes per al tècnic <em>Opcional</em>
              </span>
              <textarea
                rows={3}
                value={planningNotes}
                onChange={(event) => setPlanningNotes(event.target.value)}
                placeholder="P. ex.: Revisa la bomba i avisa abans d'accedir al quart tècnic."
              />
              <small className="work-planning-notes-help">
                El tècnic les veurà abans d'iniciar la feina.
              </small>
            </label>
          </div>
          {unavailable && (
            <p className="form-error">
              Selecciona un client, una instal·lació i un tècnic per programar la feina.
            </p>
          )}
          {error && <p className="form-error">{error}</p>}
          <DialogFooter className="work-editor-dialog-footer">
            <DialogClose variant="outline" disabled={saving}>
              Cancel·la
            </DialogClose>
            <Button type="submit" disabled={saving || unavailable}>
              {saving
                ? "S'està desant…"
                : visit === 'new'
                  ? 'Programa la feina'
                  : 'Desa els canvis'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function toDateTimeLocal(value: string) {
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function statusLabel(status: string) {
  return (
    {
      scheduled: 'Programada',
      in_progress: 'En curs',
      completed: 'Finalitzada',
      cancelled: 'Cancel·lada',
    }[status] ?? 'Sense estat'
  )
}
