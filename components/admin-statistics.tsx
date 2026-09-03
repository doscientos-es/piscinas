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

const money = new Intl.NumberFormat('ca-ES', { style: 'currency', currency: 'EUR' })
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
        <h2>Estadístiques restringides</h2>
        <p>Aquest apartat només està disponible per a administració.</p>
      </section>
    )
  }

  return (
    <section className="analytics-page">
      {loading && <div className="analytics-loading">S'estan preparant els indicadors…</div>}
      {error && (
        <div className="analytics-error">No s'han pogut carregar les estadístiques: {error}</div>
      )}
      {statistics && options && (
        <>
          <div className="analytics-kpis">
            <Metric
              icon={<CalendarDays size={19} />}
              label="Visites previstes"
              value={String(statistics.totals.planned)}
            />
            <Metric
              icon={<CheckCircle2 size={19} />}
              label="Visites completades"
              value={`${percentage(statistics.totals.completed, statistics.totals.planned)}%`}
              detail={`${statistics.totals.completed} tancades`}
            />
            <Metric
              icon={<Clock3 size={19} />}
              label="Inicis puntuals"
              value={`${percentage(statistics.punctuality.onTime, statistics.totals.started)}%`}
              detail={`${statistics.totals.started} inicis registrats`}
            />
            <Metric
              icon={<CircleDollarSign size={19} />}
              label="Facturació emesa"
              value={money.format(statistics.totals.invoiced)}
              detail={`${money.format(statistics.totals.collected)} cobrado`}
            />
          </div>
          <div className="analytics-grid">
            <article className="analytics-chart-card analytics-chart-wide">
              <div className="analytics-chart-heading">
                <div>
                  <h3>Activitat de visites</h3>
                  <p>Planificades en comparació amb informes completats.</p>
                </div>
              </div>
              <EChart option={options.activity} label="Gràfic mensual d'activitat de visites" />
            </article>
            <article className="analytics-chart-card">
              <div className="analytics-chart-heading">
                <div>
                  <h3>Estat de l'agenda</h3>
                  <p>Distribució de les visites del període.</p>
                </div>
              </div>
              <EChart option={options.status} label="Gràfic d'estat de les visites" />
            </article>
            <article className="analytics-chart-card">
              <div className="analytics-chart-heading">
                <div>
                  <h3>Puntualitat d'inici</h3>
                  <p>Desviació respecte de l'hora planificada.</p>
                </div>
              </div>
              <EChart option={options.punctuality} label="Gràfic de puntualitat d'inici" />
            </article>
            <article className="analytics-chart-card analytics-chart-wide">
              <div className="analytics-chart-heading">
                <div>
                  <h3>Facturació i cobrament</h3>
                  <p>Import emès en comparació amb l'import cobrat.</p>
                </div>
              </div>
              <EChart option={options.billing} label="Gràfic mensual de facturació i cobrament" />
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
          name: 'Planificades',
          type: 'bar',
          data: statistics.months.map((month) => month.planned),
          itemStyle: { color: colours.cyan, borderRadius: [5, 5, 0, 0] },
        },
        {
          name: 'Completades',
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
              name: 'Completades',
              value: statistics.status.completed,
              itemStyle: { color: colours.green },
            },
            {
              name: 'En curs',
              value: statistics.status.in_progress,
              itemStyle: { color: colours.primary },
            },
            {
              name: 'Programades',
              value: statistics.status.scheduled,
              itemStyle: { color: colours.cyan },
            },
            {
              name: 'Cancel·lades',
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
      xAxis: { type: 'category', data: ['Abans', 'Puntual', '16–90 min', '>90 min'], ...axis },
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
          name: 'Emès',
          type: 'bar',
          data: statistics.months.map((month) => month.invoiced),
          itemStyle: { color: colours.primary, borderRadius: [5, 5, 0, 0] },
        },
        {
          name: 'Cobrat',
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
