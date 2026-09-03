'use client'

import { CalendarDays, Search, UserRound } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

import {
  filterWorkHistory,
  paginateWorkHistory,
  type WorkHistoryVisit,
} from '@/lib/work-history'

const pageSize = 10

export function WorkHistory({ visits, isAdmin }: { visits: WorkHistoryVisit[]; isAdmin: boolean }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('completed')
  const [technicianId, setTechnicianId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(0)
  const technicians = useMemo(
    () => Array.from(new Map(visits.filter((visit) => visit.technician_id && visit.technician).map((visit) => [visit.technician_id, visit.technician!.full_name])).entries()),
    [visits],
  )
  const results = filterWorkHistory(visits, { query, status, technicianId, from, to })
  const pageCount = Math.max(1, Math.ceil(results.length / pageSize))
  const visibleVisits = paginateWorkHistory(results, Math.min(page, pageCount - 1), pageSize)
  const resetPage = () => setPage(0)

  return (
    <section className="work-history" aria-label="Historial de trabajos">
      <header className="work-history-heading">
        <div>
          <span>Historial operativo</span>
          <h2>Trabajos</h2>
          <p>{isAdmin ? 'Consulta toda la actividad realizada por el equipo.' : 'Consulta el historial de tus trabajos realizados.'}</p>
        </div>
        <strong>{results.length} resultados</strong>
      </header>
      <div className="work-history-filters">
        <label className="client-search">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">Buscar trabajos</span>
          <input value={query} onChange={(event) => { setQuery(event.target.value); resetPage() }} placeholder="Cliente, instalación o parte" />
        </label>
        <select aria-label="Estado" value={status} onChange={(event) => { setStatus(event.target.value); resetPage() }}>
          <option value="completed">Finalizados</option>
          <option value="all">Todos los estados</option>
          <option value="in_progress">En curso</option>
          <option value="scheduled">Programados</option>
          <option value="cancelled">Cancelados</option>
        </select>
        {isAdmin && <select aria-label="Técnico" value={technicianId} onChange={(event) => { setTechnicianId(event.target.value); resetPage() }}><option value="">Todo el equipo</option>{technicians.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>}
        <label>Desde<input aria-label="Desde" type="date" value={from} onChange={(event) => { setFrom(event.target.value); resetPage() }} /></label>
        <label>Hasta<input aria-label="Hasta" type="date" value={to} onChange={(event) => { setTo(event.target.value); resetPage() }} /></label>
      </div>
      <div className="work-history-list" role="list">
        {visibleVisits.map((visit) => <article className="work-history-row" key={visit.id} role="listitem">
          <time><CalendarDays size={16} aria-hidden="true" />{new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(visit.scheduled_for))}</time>
          <div><strong>{visit.installations?.clients?.legal_name ?? 'Cliente'}</strong><span>{visit.installations?.name ?? 'Instalación'} · {visit.installations?.address ?? 'Sin dirección'}</span>{visit.interventions?.notes && <small>{visit.interventions.notes}</small>}</div>
          {isAdmin && <span className="work-history-technician"><UserRound size={15} aria-hidden="true" />{visit.technician?.full_name ?? 'Sin asignar'}</span>}
          <span className={`badge ${visit.status === 'completed' ? 'paid' : visit.status === 'cancelled' ? 'pending' : ''}`}>{statusLabel(visit.status)}</span>
          <Link className="action-link" href={`/agenda/${visit.id}`}>Ver parte</Link>
        </article>)}
      </div>
      {visibleVisits.length === 0 && <div className="empty-results"><CalendarDays size={25} aria-hidden="true" /><p>No hay trabajos que coincidan con los filtros.</p></div>}
      <nav className="pagination" aria-label="Paginación de trabajos">
        <button className="button secondary" type="button" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Anterior</button>
        <span>Página {Math.min(page + 1, pageCount)} de {pageCount}</span>
        <button className="button secondary" type="button" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => value + 1)}>Siguiente</button>
      </nav>
    </section>
  )
}

function statusLabel(status: string) {
  return { scheduled: 'Programado', in_progress: 'En curso', completed: 'Finalizado', cancelled: 'Cancelado' }[status] ?? 'Sin estado'
}