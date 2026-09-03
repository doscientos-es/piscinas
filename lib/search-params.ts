export type SearchParamUpdates = Record<string, string | number | null | undefined>

export function applySearchParamUpdates(current: string, updates: SearchParamUpdates) {
  const params = new URLSearchParams(current)

  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined || value === '') params.delete(key)
    else params.set(key, String(value))
  }

  return params.toString()
}