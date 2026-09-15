'use client'

import {
  AutocompleteCombobox,
  Button,
  ConfirmDialog,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  HighlightMatch,
} from '@doscientos/ui'
import { CalendarDays, Pencil, Search, Trash2, UserRound } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { SearchParamUpdates } from '@/lib/search-params'
import { usePersistentSearchParams } from '@/lib/use-persistent-search-params'
import {
  canEditWork,
  canManagePendingWork,
  filterWorkHistory,
  getDefaultScheduledFor,
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
  creationVersion: number
}

export function WorkHistory({
  visits,
  installations,
  technicians,
  isAdmin,
  onSavePendingWork,
  onDeletePendingWork,
  creationVersion,
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
      : 'all'
  const technicianId = searchParams.get('tecnico') ?? ''
  const from = searchParams.get('desde') ?? ''
  const to = searchParams.get('hasta') ?? ''
  const requestedPage = Number(searchParams.get('pagina') ?? '1')
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage - 1 : 0
  const [editingVisit, setEditingVisit] = useState<WorkHistoryVisit | 'new' | null>(null)
  const [deletingVisit, setDeletingVisit] = useState<WorkHistoryVisit | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [operationError, setOperationError] = useState<string | null>(null)
  const handledCreationVersion = useRef(creationVersion)
  useEffect(() => {
    if (creationVersion === handledCreationVersion.current) return
    handledCreationVersion.current = creationVersion
    setOperationError(null)
    setEditingVisit('new')
  }, [creationVersion])
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
    <section className="work-history" aria-label="Trabajos">
      <div className="work-history-filters">
        <label className="client-search">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">Buscar trabajos</span>
          <input
            value={query}
            onChange={(event) => {
              updateFilters({ q: event.target.value })
            }}
            placeholder="Cliente, instalación o informe"
          />
        </label>
        <select
          aria-label="Estat"
          value={status}
          onChange={(event) => {
            updateFilters({ estado: event.target.value })
          }}
        >
          <option value="completed">Finalizadas</option>
          <option value="all">Todos los estados</option>
          <option value="in_progress">En curso</option>
          <option value="scheduled">Programadas</option>
          <option value="cancelled">Canceladas</option>
        </select>
        {isAdmin && (
          <select
            aria-label="Técnico"
            value={technicianId}
            onChange={(event) => {
              updateFilters({ tecnico: event.target.value })
            }}
          >
            <option value="">Todo el equipo</option>
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
          Hasta
          <input
            aria-label="Hasta"
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
              {new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(
                new Date(visit.scheduled_for),
              )}
            </time>
            <div>
              <strong>{visit.installations?.clients?.legal_name ?? 'Cliente'}</strong>
              <span>
                {visit.installations?.name ?? 'Instalación'} ·{' '}
                {visit.installations?.address ?? 'Sin dirección'}
              </span>
              {visit.planning_notes && <small>Planificación: {visit.planning_notes}</small>}
              {visit.interventions?.notes && <small>{visit.interventions.notes}</small>}
            </div>
            {isAdmin && (
              <span className="work-history-technician">
                <UserRound size={15} aria-hidden="true" />
                {visit.technician?.full_name ?? 'Sin asignar'}
              </span>
            )}
            <span
              className={`badge ${visit.status === 'completed' ? 'paid' : visit.status === 'cancelled' ? 'pending' : ''}`}
            >
              {statusLabel(visit.status)}
            </span>
            {canEditWork(isAdmin) ? (
              <div className="work-history-actions">
                {visit.status === 'completed' && (
                  <Link className="action-link" href={`/trabajos/${visit.id}`}>
                    Ver informe
                  </Link>
                )}
                <Button
                  className="action-link"
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setOperationError(null)
                    setEditingVisit(visit)
                  }}
                >
                  <Pencil size={15} aria-hidden="true" />
                  Editar
                </Button>
                {canManagePendingWork(isAdmin, visit.status) && (
                  <Button
                    className="action-link danger"
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      setOperationError(null)
                      setDeletingVisit(visit)
                    }}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                    Eliminar
                  </Button>
                )}
              </div>
            ) : visit.status === 'completed' ? (
              <Link className="action-link" href={`/trabajos/${visit.id}`}>
                Ver informe
              </Link>
            ) : visit.status !== 'scheduled' ? (
              <Link className="action-link" href={`/agenda/${visit.id}`}>
                Ver
              </Link>
            ) : (
              <span className="muted">Pendiente</span>
            )}
          </article>
        ))}
      </div>
      {operationError && <p className="form-error">{operationError}</p>}
      {visibleVisits.length === 0 && (
        <div className="empty-results">
          <CalendarDays size={25} aria-hidden="true" />
          <p>No hay trabajos que coincidan con los filtros.</p>
        </div>
      )}
      <nav className="pagination" aria-label="Paginación de trabajos">
        <Button
          type="button"
          variant="outline"
          disabled={currentPage === 0}
          onClick={() => changePage(currentPage - 1)}
        >
          Anterior
        </Button>
        <span>
          Página {currentPage + 1} de {pageCount}
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={currentPage + 1 >= pageCount}
          onClick={() => changePage(currentPage + 1)}
        >
          Siguiente
        </Button>
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
      <ConfirmDialog
        open={Boolean(deletingVisit)}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setDeletingVisit(null)
        }}
        title="¿Eliminar el trabajo programado?"
        description="Esta acción no se puede deshacer."
        confirmLabel="Eliminar trabajo"
        cancelLabel="Cancelar"
        destructive
        pending={isDeleting}
        onConfirm={() => {
          if (!deletingVisit) return
          setIsDeleting(true)
          void onDeletePendingWork(deletingVisit.id)
            .catch((error: unknown) => {
              setOperationError(error instanceof Error ? error.message : 'No se ha podido eliminar el trabajo.')
            })
            .finally(() => {
              setIsDeleting(false)
              setDeletingVisit(null)
            })
        }}
      />
    </section>
  )
}

export function WorkEditor({
  visit,
  installations,
  technicians,
  onClose,
  onSave,
  initialScheduledFor,
}: {
  visit: WorkHistoryVisit | 'new'
  installations: WorkInstallation[]
  technicians: WorkTechnician[]
  onClose: () => void
  onSave: (input: PendingWorkInput) => Promise<void>
  initialScheduledFor?: string
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
    visit === 'new' ? (initialScheduledFor ?? getDefaultScheduledFor()) : toDateTimeLocal(visit.scheduled_for),
  )
  const [planningNotes, setPlanningNotes] = useState(
    visit === 'new' ? '' : (visit.planning_notes ?? ''),
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const clients = useMemo(() => groupWorkInstallationsByClient(installations), [installations])
  const selectedClient = clients.find((client) => client.id === selectedClientId)
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
      setError(saveError instanceof Error ? saveError.message : 'No se ha podido guardar el trabajo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="work-editor-dialog sm:max-w-2xl">
        <DialogHeader className="work-editor-dialog-header">
          <DialogTitle>{visit === 'new' ? 'Trabajo nuevo' : 'Editar trabajo'}</DialogTitle>
          <DialogDescription>
            Actualiza la persona responsable y la fecha de la visita.
          </DialogDescription>
        </DialogHeader>
        <form className="record-form" onSubmit={(event) => void submit(event)}>
          <div className="form-grid">
            <AutocompleteCombobox
              className="form-span-2 work-client-picker"
              label="Cliente"
              description={
                selectedClient
                  ? 'Cliente seleccionado. Puedes escribir para cambiarlo.'
                  : 'Escribe el nombre del cliente y selecciónalo de la lista.'
              }
              placeholder="Buscar por nombre del cliente"
              aria-label="Buscar un cliente"
              items={clients}
              inputValue={clientSearch}
              selectedKey={selectedClientId || null}
              getItemKey={(client) => client.id}
              getItemLabel={(client) => client.name}
              onInputChange={updateClientSearch}
              onSelectionChange={(_key, client) => {
                if (client) selectClient(client)
              }}
              renderItem={(client, query) => (
                <div className="grid gap-0.5">
                  <strong>
                    <HighlightMatch text={client.name} query={query} />
                  </strong>
                  <small className="text-muted-foreground text-xs">
                    {client.installations.length}{' '}
                    {client.installations.length === 1 ? 'instalación' : 'instalaciones'}
                  </small>
                </div>
              )}
              emptyState={
                <p className="text-muted-foreground px-3 py-5 text-center text-sm">
                  No hay clientes que coincidan con la búsqueda.
                </p>
              }
            />
            {selectedClient?.installations.length === 1 ? (
              <div className="field form-span-2">
                <span>Instalación</span>
                <div className="work-installation-selected">
                  <strong>{selectedClient.installations[0].name}</strong>
                  <small>{selectedClient.installations[0].address}</small>
                </div>
              </div>
            ) : selectedClient ? (
              <label className="field form-span-2">
                <span>Instalación</span>
                <select
                  value={installationId}
                  onChange={(event) => setInstallationId(event.target.value)}
                  required
                >
                  <option value="" disabled>
                    Selecciona una instalación
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
                <span>Instalación</span>
                <p>Selecciona primero un cliente.</p>
              </div>
            )}
            <label className="field">
              <span>Técnico</span>
              <select
                value={technicianId}
                onChange={(event) => setTechnicianId(event.target.value)}
                required
              >
                <option value="" disabled>
                  Selecciona un técnico
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
                Notas para el técnico <em>Opcional</em>
              </span>
              <textarea
                rows={3}
                value={planningNotes}
                onChange={(event) => setPlanningNotes(event.target.value)}
                placeholder="P. ej.: Revisa la bomba y avisa antes de acceder al cuarto técnico."
              />
              <small className="work-planning-notes-help">
                El técnico las verá antes de iniciar el trabajo.
              </small>
            </label>
          </div>
          {unavailable && (
            <p className="form-error">
              Selecciona un cliente, una instalación y un técnico para programar el trabajo.
            </p>
          )}
          {error && <p className="form-error">{error}</p>}
          <DialogFooter className="work-editor-dialog-footer">
            <DialogClose variant="outline" disabled={saving}>
              Cancelar
            </DialogClose>
            <Button type="submit" disabled={saving || unavailable}>
              {saving
                ? 'Guardando…'
                : visit === 'new'
                  ? 'Programar trabajo'
                  : 'Guardar cambios'}
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
      in_progress: 'En curso',
      completed: 'Finalizada',
      cancelled: 'Cancelada',
    }[status] ?? 'Sin estado'
  )
}
