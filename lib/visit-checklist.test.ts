import { describe, expect, it } from 'vitest'

import { buildVisitNotes, parseVisitNotes } from './visit-checklist'

describe('buildVisitNotes', () => {
  it('crea una descripción con las tareas habituales marcadas', () => {
    expect(buildVisitNotes('', ['filter', 'ph'])).toBe(
      'Tareas realizadas:\n• He limpiado el filtro o hecho un lavado\n• He medido y ajustado el pH',
    )
  })

  it('conserva los detalles escritos por el técnico', () => {
    expect(buildVisitNotes('  El agua estaba algo turbia.  ', ['surface'])).toBe(
      'Tareas realizadas:\n• He retirado hojas y residuos\n\nEl agua estaba algo turbia.',
    )
  })

  it('ignora checks que no pertenecen a la lista', () => {
    expect(buildVisitNotes('', ['desconocido'])).toBe('')
  })

  it('separa los checks guardados de las notas libres del parte', () => {
    expect(
      parseVisitNotes(
        'Tareas realizadas:\n• He limpiado el filtro o hecho un lavado\n• He medido y ajustado el pH\n\nEl agua estaba algo turbia.',
      ),
    ).toEqual({ completedCheckIds: ['filter', 'ph'], details: 'El agua estaba algo turbia.' })
  })
})
