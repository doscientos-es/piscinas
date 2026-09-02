import { describe, expect, it } from "vitest";
import { validateAuthInput } from "./auth-validation";

describe("validateAuthInput", () => {
  it("requiere un nombre al registrarse", () => {
    expect(validateAuthInput({ mode: "register", name: "", email: "operaciones@concepteblau.cat", password: "segura123" })).toBe("Introduce tu nombre para crear la cuenta.");
  });

  it("acepta credenciales válidas para iniciar sesión", () => {
    expect(validateAuthInput({ mode: "login", name: "", email: "operaciones@concepteblau.cat", password: "segura123" })).toBeNull();
  });
});
