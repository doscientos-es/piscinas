export function getAgendaVisitAction(status: string, isSupervisor: boolean) {
  if (isSupervisor) {
    const labels: Record<string, string> = {
      scheduled: 'Programada',
      in_progress: 'En curs',
      completed: 'Veure',
      cancelled: 'Cancel·lada',
    }
    return { label: labels[status] ?? 'Sense estat', isInteractive: status === 'completed' }
  }

  if (status === 'scheduled') return { label: 'Inicia', isInteractive: true }
  if (status === 'in_progress') return { label: 'Continua', isInteractive: true }
  return { label: 'Veure informe', isInteractive: status === 'completed' }
}
