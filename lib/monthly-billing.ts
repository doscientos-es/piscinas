export function getBillingPeriod(value: Date = new Date()) {
  return new Date(value.getFullYear(), value.getMonth(), 1)
}

export function getPreviousBillingPeriod(value: Date = new Date()) {
  return new Date(value.getFullYear(), value.getMonth() - 1, 1)
}

export function toBillingPeriodValue(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-01`
}

export function formatBillingPeriod(value: string | null) {
  if (!value) return 'Sin período asignado'
  return new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(
    new Date(`${value}T12:00:00`),
  )
}

export function getBillingPeriodOptions(now: Date = new Date(), count = 12) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1)
    const value = toBillingPeriodValue(date)
    return { value, label: formatBillingPeriod(value) }
  })
}