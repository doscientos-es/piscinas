export const standardVisitChecks = [
  { id: 'surface', label: 'He retirat fulles i residus' },
  { id: 'baskets', label: 'He netejat els cistells dels skimmers' },
  { id: 'filter', label: "He netejat el filtre o n'he fet un rentat" },
  { id: 'floor', label: 'He netejat el fons' },
  { id: 'walls', label: 'He raspallat les parets i la línia d'aigua' },
  { id: 'water', label: 'He revisat el nivell i l'aspecte de l'aigua' },
  { id: 'ph', label: 'He mesurat i ajustat el pH' },
  { id: 'disinfectant', label: 'He mesurat i ajustat el clor o desinfectant' },
  { id: 'equipment', label: 'He revisat la bomba i la depuradora' },
] as const

export function buildVisitNotes(notes: string, completedCheckIds: readonly string[]) {
  const completedChecks = standardVisitChecks
    .filter((check) => completedCheckIds.includes(check.id))
    .map((check) => `• ${check.label}`)
  const checklistNotes = completedChecks.length
    ? `Feines realitzades:\n${completedChecks.join('\n')}`
    : ''

  return [checklistNotes, notes.trim()].filter(Boolean).join('\n\n')
}

export function parseVisitNotes(notes: string | null) {
  const report = notes?.trim() ?? ''
  const completedCheckIds = standardVisitChecks
    .filter((check) => report.includes(`• ${check.label}`))
    .map((check) => check.id)
  const checklist = completedCheckIds
    .map((id) => standardVisitChecks.find((check) => check.id === id))
    .filter((check) => check !== undefined)
    .map((check) => `• ${check.label}`)
    .join('\n')
  const prefix = checklist ? `Feines realitzades:\n${checklist}` : ''

  return {
    completedCheckIds,
    details: prefix && report.startsWith(prefix) ? report.slice(prefix.length).trim() : report,
  }
}
