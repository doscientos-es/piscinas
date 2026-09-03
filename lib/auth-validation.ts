export type AuthMode = 'login' | 'register'

type AuthInput = {
  email: string
  password: string
  name: string
  mode: AuthMode
}

export function validateAuthInput({ email, password, name, mode }: AuthInput) {
  if (mode === 'register' && name.trim().length < 2) {
    return 'Introdueix el teu nom per crear el compte.'
  }

  if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
    return 'Introdueix una adreça electrònica vàlida.'
  }

  if (password.length < 8) {
    return 'La contrasenya ha de tenir almenys 8 caràcters.'
  }

  return null
}
