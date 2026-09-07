type AuthInput = {
  email: string
  password: string
}

export function validateAuthInput({ email, password }: AuthInput) {
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
    return 'Introdueix una adreça electrònica vàlida.'
  }

  if (password.length < 8) {
    return 'La contrasenya ha de tenir almenys 8 caràcters.'
  }

  return null
}
