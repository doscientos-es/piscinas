export const standardVisitChecks = [
  { id: "surface", label: "He retirado hojas y residuos" },
  { id: "baskets", label: "He limpiado los cestos de los skimmers" },
  { id: "filter", label: "He limpiado el filtro o hecho un lavado" },
  { id: "floor", label: "He limpiado el fondo" },
  { id: "walls", label: "He cepillado las paredes y la línea de agua" },
  { id: "water", label: "He revisado el nivel y el aspecto del agua" },
  { id: "ph", label: "He medido y ajustado el pH" },
  { id: "disinfectant", label: "He medido y ajustado el cloro o desinfectante" },
  { id: "equipment", label: "He revisado la bomba y la depuradora" },
] as const;

export function buildVisitNotes(notes: string, completedCheckIds: readonly string[]) {
  const completedChecks = standardVisitChecks
    .filter((check) => completedCheckIds.includes(check.id))
    .map((check) => `• ${check.label}`);
  const checklistNotes = completedChecks.length ? `Tareas realizadas:\n${completedChecks.join("\n")}` : "";

  return [checklistNotes, notes.trim()].filter(Boolean).join("\n\n");
}