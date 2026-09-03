import { describe, expect, it } from 'vitest'

import { buildVisitNotes, parseVisitNotes } from './visit-checklist'

describe('buildVisitNotes', () => {
  it('crea una descripció amb les feines habituals marcades', () => {
    expect(buildVisitNotes('', ['filter', 'ph'])).toBe(
      "Feines realitzades:\n• He netejat el filtre o n'he fet un rentat\n• He mesurat i ajustat el pH",
    )
  })

  it('conserva els detalls escrits pel tècnic', () => {
    expect(buildVisitNotes("  L'aigua estava una mica tèrbola.  ", ['surface'])).toBe(
      "Feines realitzades:\n• He retirat fulles i residus\n\nL'aigua estava una mica tèrbola.",
    )
  })

  it('ignora verificacions que no pertanyen a la llista', () => {
    expect(buildVisitNotes('', ['desconegut'])).toBe('')
  })

  it("separa les verificacions desades de les notes lliures de l'informe", () => {
    expect(
      parseVisitNotes(
        "Feines realitzades:\n• He netejat el filtre o n'he fet un rentat\n• He mesurat i ajustat el pH\n\nL'aigua estava una mica tèrbola.",
      ),
    ).toEqual({ completedCheckIds: ['filter', 'ph'], details: "L'aigua estava una mica tèrbola." })
  })
})
