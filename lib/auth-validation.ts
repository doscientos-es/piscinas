export type AuthMode = "login" | "register";

type AuthInput = {
  email: string;
  password: string;
  name: string;
  mode: AuthMode;
};

export function validateAuthInput({ email, password, name, mode }: AuthInput) {
  if (mode === "register" && name.trim().length < 2) {
    return "Introduce tu nombre para crear la cuenta.";
  }

  if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
    return "Introduce un correo electrónico válido.";
  }

  if (password.length < 8) {
    return "La contraseña debe tener al menos 8 caracteres.";
  }

  return null;
}
