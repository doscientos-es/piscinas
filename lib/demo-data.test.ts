import { describe, expect, it } from "vitest";
import { seedInvoices, todayVisits } from "./demo-data";

describe("datos de demo", () => {
  it("incluye una visita que muestra el flujo de parte", () => {
    expect(todayVisits.some((visit) => visit.status === "En curso")).toBe(true);
  });

  it("incluye un borrador para el cierre mensual", () => {
    expect(seedInvoices.some((invoice) => invoice.status === "Borrador")).toBe(true);
  });
});
