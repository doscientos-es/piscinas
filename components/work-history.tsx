'use client'

import { CalendarDays, Pencil, Plus, Search, Trash2, UserRound, X } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

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
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('completed')
  const [technicianId, setTechnicianId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(0)
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
  useEffect(() => {
    if (isAdmin) setStatus('scheduled')
  }, [isAdmin])
  const results = filterWorkHistory(visits, { query, status, technicianId, from, to })
  const pageCount = Math.max(1, Math.ceil(results.length / pageSize))
  const visibleVisits = paginateWorkHistory(results, Math.min(page, pageCount - 1), pageSize)
  const resetPage = () => setPage(0)

  return (
    <section className="work-history" aria-label="Trabajos">
      <header className="work-history-heading">
        <div>
          <h2>Trabajos</h2>
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
              Nuevo trabajo
            </button>
          )}
        </div>
      </header>
      <div className="work-history-filters">
        <label className="client-search">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">Buscar trabajos</span>
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              resetPage()
            }}
            placeholder="Cliente, instalación o parte"
          />
        </label>
        <select
          aria-label="Estado"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value)
            resetPage()
          }}
        >
          <option value="completed">Finalizados</option>
          <option value="all">Todos los estados</option>
          <option value="in_progress">En curso</option>
          <option value="scheduled">Programados</option>
          <option value="cancelled">Cancelados</option>
        </select>
        {isAdmin && (
          <select
            aria-label="Técnico"
            value={technicianId}
            onChange={(event) => {
              setTechnicianId(event.target.value)
              resetPage()
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
          Desde
          <input
            aria-label="Desde"
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value)
              resetPage()
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
              setTo(event.target.value)
              resetPage()
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
                  Editar
                </button>
                <button
                  className="action-link danger"
                  type="button"
                  onClick={() => {
                    if (
                      !window.confirm(
                        '¿Eliminar este trabajo programado? Esta acción no se puede deshacer.',
                      )
                    )
                      return
                    setOperationError(null)
                    void onDeletePendingWork(visit.id).catch((error: unknown) => {
                      setOperationError(
                        error instanceof Error
                          ? error.message
                          : 'No se ha podido eliminar el trabajo.',
                      )
                    })
                  }}
                >
                  <Trash2 size={15} aria-hidden="true" />
                  Eliminar
                </button>
              </div>
            ) : visit.status !== 'scheduled' ? (
              <Link className="action-link" href={`/agenda/${visit.id}`}>
                {visit.status === 'completed' ? 'Ver parte' : 'Ver'}
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
        <button
          className="button secondary"
          type="button"
          disabled={page === 0}
          onClick={() => setPage((value) => value - 1)}
        >
          Anterior
        </button>
        <span>
          Página {Math.min(page + 1, pageCount)} de {pageCount}
        </span>
        <button
          className="button secondary"
          type="button"
          disabled={page + 1 >= pageCount}
          onClick={() => setPage((value) => value + 1)}
        >
          Siguiente
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
      await onSave({ installationId, technicianId, scheduledFor })
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : 'No se ha podido guardar el trabajo.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="work-editor-title"
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow">Planificación</span>
            <h2 id="work-editor-title">{visit === 'new' ? 'Nuevo trabajo' : 'Editar trabajo'}</h2>
          </div>
          <button className="close" type="button" onClick={onClose} aria-label="Cerrar">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <form className="record-form" onSubmit={(event) => void submit(event)}>
          <div className="form-grid">
            <div className="field form-span-2 work-client-picker">
              <span>Cliente</span>
              <input
                type="search"
                value={clientSearch}
                onChange={(event) => updateClientSearch(event.target.value)}
                placeholder="Busca por nombre de cliente"
                aria-label="Buscar cliente"
                autoComplete="off"
              />
              {selectedClient ? (
                <div className="work-client-selected">
                  <span>
                    <strong>{selectedClient.name}</strong>
                    <small>
                      {selectedClient.installations.length}{' '}
                      {selectedClient.installations.length === 1 ? 'instalación' : 'instalaciones'}
                    </small>
                  </span>
                  <button
                    type="button"
                    className="action-link"
                    onClick={() => updateClientSearch('')}
                  >
                    Cambiar
                  </button>
                </div>
              ) : clientSearch.trim() ? (
                <div className="work-client-options" aria-label="Clientes encontrados">
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
                          {client.installations.length === 1 ? 'instalación' : 'instalaciones'}
                        </small>
                      </button>
                    ))
                  ) : (
                    <p>No hay clientes que coincidan con la búsqueda.</p>
                  )}
                </div>
              ) : (
                <p className="work-client-hint">
                  Busca y selecciona el cliente antes de elegir la instalación.
                </p>
              )}
            </div>
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
              <span>Fecha y hora</span>
              <input
                type="datetime-local"
                value={scheduledFor}
                onChange={(event) => setScheduledFor(event.target.value)}
                required
              />
            </label>
          </div>
          {unavailable && (
            <p className="form-error">
              Selecciona un cliente, una instalación y un técnico para programar el trabajo.
            </p>
          )}
          {error && <p className="form-error">{error}</p>}
          <div className="modal-foot">
            <button className="button secondary" type="button" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button className="button" type="submit" disabled={saving || unavailable}>
              {saving ? 'Guardando…' : visit === 'new' ? 'Programar trabajo' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </section>
    </div>
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
      scheduled: 'Programado',
      in_progress: 'En curso',
      completed: 'Finalizado',
      cancelled: 'Cancelado',
    }[status] ?? 'Sin estado'
  )
}
