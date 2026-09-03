import { describe, expect, it } from 'vitest'

import { getAgendaVisitAction } from './agenda-access'

describe('getAgendaVisitAction', () => {
  it('deja a los técnicos iniciar o continuar sus faenas', () => {
    expect(getAgendaVisitAction('scheduled', false)).toEqual({
      label: 'Iniciar',
      isInteractive: true,
    })
    expect(getAgendaVisitAction('in_progress', false)).toEqual({
      label: 'Continuar',
      isInteractive: true,
    })
  })

  it('mantiene la agenda de administración en solo supervisión', () => {
    expect(getAgendaVisitAction('scheduled', true)).toEqual({
      label: 'Programada',
      isInteractive: false,
    })
    expect(getAgendaVisitAction('completed', true)).toEqual({
      label: 'Completada',
      isInteractive: false,
    })
  })
})