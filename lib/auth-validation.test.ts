import { describe, expect, it } from 'vitest'

import { validateAuthInput } from './auth-validation'

describe('validateAuthInput', () => {
  it('requereix un nom en registrar-se', () => {
    expect(
      validateAuthInput({
        mode: 'register',
        name: '',
        email: 'operaciones@concepteblau.cat',
        password: 'segura123',
      }),
    ).toBe('Introdueix el teu nom per crear el compte.')
  })

  it('accepta credencials vàlides per iniciar sessió', () => {
    expect(
      validateAuthInput({
        mode: 'login',
        name: '',
        email: 'operaciones@concepteblau.cat',
        password: 'segura123',
      }),
    ).toBeNull()
  })
})
