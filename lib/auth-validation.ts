type AuthInput = {
  email: string
  password: string
}

export function validateAuthInput({ email, password }: AuthInput) {
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
    return 'Introduce una dirección de correo electrónico válida.'
  }

  if (password.length < 8) {
    return 'La contraseña debe tener al menos 8 caracteres.'
  }

  return null
}
