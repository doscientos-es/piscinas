export function getAgendaVisitAction(status: string, isSupervisor: boolean) {
  if (isSupervisor) {
    const labels: Record<string, string> = {
      scheduled: 'Programada',
      in_progress: 'En curso',
      completed: 'Completada',
      cancelled: 'Cancelada',
    }
    return { label: labels[status] ?? 'Sin estado', isInteractive: false }
  }

  if (status === 'scheduled') return { label: 'Iniciar', isInteractive: true }
  if (status === 'in_progress') return { label: 'Continuar', isInteractive: true }
  return { label: 'Ver parte', isInteractive: status === 'completed' }
}