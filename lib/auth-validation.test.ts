import { describe, expect, it } from 'vitest'

import { validateAuthInput } from './auth-validation'

describe('validateAuthInput', () => {
  it('requereix una adreça electrònica vàlida', () => {
    expect(
      validateAuthInput({
        email: 'no-es-un-correu',
        password: 'segura123',
      }),
    ).toBe('Introdueix una adreça electrònica vàlida.')
  })

  it('accepta credencials vàlides per iniciar sessió', () => {
    expect(
      validateAuthInput({
        email: 'operaciones@concepteblau.cat',
        password: 'segura123',
      }),
    ).toBeNull()
  })
})
