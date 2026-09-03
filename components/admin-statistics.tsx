'use client'

import * as echarts from 'echarts'
import { CalendarDays, CheckCircle2, CircleDollarSign, Clock3 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { TimeTrackingManagement } from '@/components/time-tracking-management'
import {
  buildAdminStatistics,
  getStatisticsPeriod,
  type AdminStatistics,
  type StatisticsInvoice,
  type StatisticsVisit,
} from '@/lib/admin-statistics'
import { createClient } from '@/lib/supabase/client'

const money = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })
const colours = {
  primary: '#0879ae',
  cyan: '#13b8e8',
  green: '#159957',
  amber: '#d48b16',
  red: '#d34e4e',
}

export function AdminStatistics({
  isAdmin,
  reloadVersion,
}: {
  isAdmin: boolean
  reloadVersion: number
}) {
  const [statistics, setStatistics] = useState<AdminStatistics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false)
      return
    }
    let active = true
    const now = new Date()
    const { start, end } = getStatisticsPeriod(now)
    const startDate = toIsoDate(start)
    const endDate = toIsoDate(end)

    const loadStatistics = async () => {
      setLoading(true)
      const supabase = createClient()
      const [visits, invoices] = await Promise.all([
        supabase
          .from('visits')
          .select('scheduled_for,status,interventions(started_at)')
          .gte('scheduled_for', start.toISOString())
          .lt('scheduled_for', end.toISOString()),
        supabase
          .from('invoices')
          .select('issued_on,status,total')
          .gte('issued_on', startDate)
          .lt('issued_on', endDate),
      ])
      if (!active) return
      const loadError = visits.error || invoices.error
      if (loadError) {
        setError(loadError.message)
        setStatistics(null)
      } else {
        setStatistics(
          buildAdminStatistics(
            (visits.data ?? []) as unknown as StatisticsVisit[],
            (invoices.data ?? []) as StatisticsInvoice[],
            now,
          ),
        )
        setError(null)
      }
      setLoading(false)
    }

    void loadStatistics()
    return () => {
      active = false
    }
  }, [isAdmin, reloadVersion])

  const options = useMemo(() => (statistics ? chartOptions(statistics) : null), [statistics])
  if (!isAdmin) {
    return (
      <section className="analytics-denied">
        <Clock3 size={24} aria-hidden="true" />
        <h2>Estadísticas restringidas</h2>
        <p>Este apartado está disponible únicamente para administración.</p>
      </section>
    )
  }

  return (
    <section className="analytics-page">
      {loading && <div className="analytics-loading">Preparando indicadores…</div>}
      {error && (
        <div className="analytics-error">No se han podido cargar las estadísticas: {error}</div>
      )}
      {statistics && options && (
        <>
          <div className="analytics-kpis">
            <Metric
              icon={<CalendarDays size={19} />}
              label="Visitas previstas"
              value={String(statistics.totals.planned)}
            />
            <Metric
              icon={<CheckCircle2 size={19} />}
              label="Visitas completadas"
              value={`${percentage(statistics.totals.completed, statistics.totals.planned)}%`}
              detail={`${statistics.totals.completed} cerradas`}
            />
            <Metric
              icon={<Clock3 size={19} />}
              label="Inicios en hora"
              value={`${percentage(statistics.punctuality.onTime, statistics.totals.started)}%`}
              detail={`${statistics.totals.started} inicios registrados`}
            />
            <Metric
              icon={<CircleDollarSign size={19} />}
              label="Facturación emitida"
              value={money.format(statistics.totals.invoiced)}
              detail={`${money.format(statistics.totals.collected)} cobrado`}
            />
          </div>
          <div className="analytics-grid">
            <article className="analytics-chart-card analytics-chart-wide">
              <div className="analytics-chart-heading">
                <div>
                  <h3>Actividad de visitas</h3>
                  <p>Planificadas frente a partes completados.</p>
                </div>
              </div>
              <EChart option={options.activity} label="Gráfico mensual de actividad de visitas" />
            </article>
            <article className="analytics-chart-card">
              <div className="analytics-chart-heading">
                <div>
                  <h3>Estado de agenda</h3>
                  <p>Distribución de las visitas del periodo.</p>
                </div>
              </div>
              <EChart option={options.status} label="Gráfico de estado de las visitas" />
            </article>
            <article className="analytics-chart-card">
              <div className="analytics-chart-heading">
                <div>
                  <h3>Puntualidad de inicio</h3>
                  <p>Desviación sobre la hora planificada.</p>
                </div>
              </div>
              <EChart option={options.punctuality} label="Gráfico de puntualidad de inicio" />
            </article>
            <article className="analytics-chart-card analytics-chart-wide">
              <div className="analytics-chart-heading">
                <div>
                  <h3>Facturación y cobro</h3>
                  <p>Importe emitido frente al importe cobrado.</p>
                </div>
              </div>
              <EChart option={options.billing} label="Gráfico mensual de facturación y cobro" />
            </article>
          </div>
          <TimeTrackingManagement />
        </>
      )}
    </section>
  )
}

function Metric({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode
  label: string
  value: string
  detail?: string
}) {
  return (
    <article className="analytics-kpi">
      <span className="analytics-kpi-icon" aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </article>
  )
}

function EChart({ option, label }: { option: echarts.EChartsOption; label: string }) {
  const element = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const container = element.current
    if (!container) return
    const chart = echarts.init(container, undefined, { renderer: 'svg' })
    chart.setOption(option, true)
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(container)
    return () => {
      observer.disconnect()
      chart.dispose()
    }
  }, [option])
  return <div ref={element} className="analytics-chart" role="img" aria-label={label} />
}

function chartOptions(statistics: AdminStatistics) {
  const labels = statistics.months.map((month) => month.label.replace('.', ''))
  const axis = { axisLine: { lineStyle: { color: '#d9e6ec' } }, axisLabel: { color: '#678293' } }
  const tooltip = {
    trigger: 'axis' as const,
    borderColor: '#dce9ef',
    textStyle: { color: '#17384d' },
  }
  return {
    activity: {
      aria: { enabled: true },
      tooltip,
      grid: { top: 18, right: 12, bottom: 26, left: 32 },
      legend: { bottom: 0, textStyle: { color: '#577284' } },
      xAxis: { type: 'category', data: labels, ...axis },
      yAxis: { type: 'value', minInterval: 1, ...axis },
      series: [
        {
          name: 'Planificadas',
          type: 'bar',
          data: statistics.months.map((month) => month.planned),
          itemStyle: { color: colours.cyan, borderRadius: [5, 5, 0, 0] },
        },
        {
          name: 'Completadas',
          type: 'bar',
          data: statistics.months.map((month) => month.completed),
          itemStyle: { color: colours.green, borderRadius: [5, 5, 0, 0] },
        },
      ],
    } satisfies echarts.EChartsOption,
    status: {
      aria: { enabled: true },
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, textStyle: { color: '#577284' } },
      series: [
        {
          type: 'pie',
          radius: ['48%', '72%'],
          label: { show: false },
          data: [
            {
              name: 'Completadas',
              value: statistics.status.completed,
              itemStyle: { color: colours.green },
            },
            {
              name: 'En curso',
              value: statistics.status.in_progress,
              itemStyle: { color: colours.primary },
            },
            {
              name: 'Programadas',
              value: statistics.status.scheduled,
              itemStyle: { color: colours.cyan },
            },
            {
              name: 'Canceladas',
              value: statistics.status.cancelled,
              itemStyle: { color: colours.red },
            },
          ],
        },
      ],
    } satisfies echarts.EChartsOption,
    punctuality: {
      aria: { enabled: true },
      tooltip,
      grid: { top: 18, right: 12, bottom: 30, left: 38 },
      xAxis: { type: 'category', data: ['Antes', 'En hora', '16–90 min', '>90 min'], ...axis },
      yAxis: { type: 'value', minInterval: 1, ...axis },
      series: [
        {
          type: 'bar',
          data: [
            statistics.punctuality.early,
            statistics.punctuality.onTime,
            statistics.punctuality.late,
            statistics.punctuality.exception,
          ],
          itemStyle: {
            borderRadius: [5, 5, 0, 0],
            color: (params: { dataIndex: number }) =>
              [colours.primary, colours.green, colours.amber, colours.red][params.dataIndex],
          },
        },
      ],
    } satisfies echarts.EChartsOption,
    billing: {
      aria: { enabled: true },
      tooltip,
      grid: { top: 18, right: 12, bottom: 26, left: 52 },
      legend: { bottom: 0, textStyle: { color: '#577284' } },
      xAxis: { type: 'category', data: labels, ...axis },
      yAxis: {
        type: 'value',
        axisLabel: { formatter: (value: number) => `${value} €`, color: '#678293' },
        axisLine: axis.axisLine,
      },
      series: [
        {
          name: 'Emitido',
          type: 'bar',
          data: statistics.months.map((month) => month.invoiced),
          itemStyle: { color: colours.primary, borderRadius: [5, 5, 0, 0] },
        },
        {
          name: 'Cobrado',
          type: 'bar',
          data: statistics.months.map((month) => month.collected),
          itemStyle: { color: colours.green, borderRadius: [5, 5, 0, 0] },
        },
      ],
    } satisfies echarts.EChartsOption,
  }
}

function percentage(value: number, total: number) {
  return total === 0 ? 0 : Math.round((value / total) * 100)
}

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
