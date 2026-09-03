'use client'

import { AlertTriangle, Save, Settings2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { createClient } from '@/lib/supabase/client'
import {
  defaultTimeTrackingPolicy,
  startExceptionLabel,
  type StartException,
  type TimeTrackingPolicy,
} from '@/lib/time-tracking-policy'

type Settings = TimeTrackingPolicy & { timezone: string }
type TimeEvent = {
  id: string
  recorded_at: string
  exception_reasons: StartException[]
  exception_reason: string | null
  distance_to_installation_m: number | null
  location_accuracy_m: number | null
  technician: { full_name: string } | null
  visits: {
    installations: { name: string; clients: { legal_name: string } | null } | null
  } | null
}

const defaultSettings: Settings = { ...defaultTimeTrackingPolicy, timezone: 'Europe/Madrid' }

export function TimeTrackingManagement() {
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [events, setEvents] = useState<TimeEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      const supabase = createClient()
      const [settingsResult, eventsResult] = await Promise.all([
        supabase.from('time_tracking_settings').select('*').eq('id', true).maybeSingle(),
        supabase
          .from('visit_time_events')
          .select(
            'id,recorded_at,exception_reasons,exception_reason,distance_to_installation_m,location_accuracy_m,technician:profiles!visit_time_events_technician_id_fkey(full_name),visits(installations(name,clients(legal_name)))',
          )
          .eq('event_type', 'start')
          .not('exception_reasons', 'eq', '{}')
          .order('recorded_at', { ascending: false })
          .limit(12),
      ])
      if (!active) return
      if (settingsResult.data) {
        setSettings({ ...defaultSettings, ...(settingsResult.data as Partial<Settings>) })
      }
      if (eventsResult.data) setEvents(eventsResult.data as unknown as TimeEvent[])
      setMessage(settingsResult.error?.message ?? eventsResult.error?.message ?? null)
      setLoading(false)
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((current) => ({ ...current, [key]: value }))
  const save = async () => {
    setSaving(true)
    setMessage(null)
    const { error } = await createClient()
      .from('time_tracking_settings')
      .update(settings)
      .eq('id', true)
    setSaving(false)
    setMessage(error ? error.message : "S'ha actualitzat la política de control horari.")
  }

  return (
    <section className="tracking-management">
      <div className="tracking-management-heading">
        <div>
          <span className="eyebrow">Configuració operativa</span>
          <h3>Política de control horari</h3>
          <p>S'aplica al servidor a tots els nous inicis de visita.</p>
        </div>
        <Settings2 size={21} aria-hidden="true" />
      </div>
      <div className="tracking-policy-grid">
        <TrackingNumberField
          label="Marge d'inici anticipat"
          suffix="minuts"
          value={settings.early_start_tolerance_minutes}
          min={0}
          max={240}
          onChange={(value) => update('early_start_tolerance_minutes', value)}
        />
        <TrackingNumberField
          label="Retard permès"
          suffix="minuts"
          value={settings.late_start_tolerance_minutes}
          min={0}
          max={480}
          onChange={(value) => update('late_start_tolerance_minutes', value)}
        />
        <TrackingNumberField
          label="Radi de la instal·lació"
          suffix="metres"
          value={settings.geofence_radius_m}
          min={25}
          max={5000}
          onChange={(value) => update('geofence_radius_m', value)}
        />
        <TrackingNumberField
          label="Precisió GPS mínima"
          suffix="metres"
          value={settings.max_location_accuracy_m}
          min={10}
          max={5000}
          onChange={(value) => update('max_location_accuracy_m', value)}
        />
        <label className="tracking-policy-toggle">
          <input
            type="checkbox"
            checked={settings.require_exception_reason}
            onChange={(event) => update('require_exception_reason', event.target.checked)}
          />
          Exigeix un motiu si hi ha una excepció
        </label>
        <button
          className="button tracking-policy-save"
          type="button"
          disabled={saving}
          onClick={save}
        >
          <Save size={16} aria-hidden="true" /> {saving ? "S'està desant…" : 'Desa la política'}
        </button>
      </div>
      {message && <p className="tracking-policy-message">{message}</p>}

      <div className="tracking-incidents-heading">
        <div>
          <h3>Inicis que requereixen revisió</h3>
          <p>Últims inicis fora de política, amb la justificació declarada.</p>
        </div>
        <AlertTriangle size={20} aria-hidden="true" />
      </div>
      {loading && <p className="tracking-incidents-empty">S'estan carregant les incidències…</p>}
      {!loading && events.length === 0 && (
        <p className="tracking-incidents-empty">No hi ha inicis excepcionals registrats.</p>
      )}
      <div className="tracking-incidents-list">
        {events.map((event) => (
          <article className="tracking-incident" key={event.id}>
            <div>
              <strong>{event.visits?.installations?.clients?.legal_name ?? 'Client'}</strong>
              <span>
                {event.visits?.installations?.name ?? 'Instal·lació'} ·{' '}
                {formatDateTime(event.recorded_at)} · {event.technician?.full_name ?? 'Tècnic'}
              </span>
            </div>
            <ul>
              {event.exception_reasons.map((reason) => (
                <li key={reason}>{startExceptionLabel[reason] ?? reason}</li>
              ))}
            </ul>
            {event.exception_reason && <p>“{event.exception_reason}”</p>}
            <small>
              {event.distance_to_installation_m !== null
                ? `${Math.round(Number(event.distance_to_installation_m))} m de la instal·lació`
                : 'Instal·lació sense punt de referència'}
              {' · '}precisió ±{Math.round(Number(event.location_accuracy_m ?? 0))} m
            </small>
          </article>
        ))}
      </div>
    </section>
  )
}

function TrackingNumberField({
  label,
  suffix,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  suffix: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <label className="tracking-policy-field">
      <span>{label}</span>
      <div>
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <small>{suffix}</small>
      </div>
    </label>
  )
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('ca-ES', { dateStyle: 'medium', timeStyle: 'medium' }).format(
    new Date(value),
  )
}
