import { describe, expect, it } from 'vitest'

import { getAgendaVisitAction } from './agenda-access'

describe('getAgendaVisitAction', () => {
  it('permet als tècnics iniciar o continuar les seves feines', () => {
    expect(getAgendaVisitAction('scheduled', false)).toEqual({
      label: 'Inicia',
      isInteractive: true,
    })
    expect(getAgendaVisitAction('in_progress', false)).toEqual({
      label: 'Continua',
      isInteractive: true,
    })
  })

  it('permet a administració consultar els informes tancats sense operar la visita', () => {
    expect(getAgendaVisitAction('scheduled', true)).toEqual({
      label: 'Programada',
      isInteractive: false,
    })
    expect(getAgendaVisitAction('completed', true)).toEqual({
      label: 'Veure',
      isInteractive: true,
    })
  })
})
