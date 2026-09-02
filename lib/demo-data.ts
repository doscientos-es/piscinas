export type VisitStatus = "Pendiente" | "En curso" | "Completada";

export interface Visit {
  id: string;
  time: string;
  client: string;
  pool: string;
  address: string;
  technician: string;
  status: VisitStatus;
  instructions: string;
}

export interface Invoice {
  id: string;
  client: string;
  period: string;
  total: number;
  status: "Borrador" | "Emitida" | "Cobrada" | "Pendiente";
}

export const todayVisits: Visit[] = [
  { id: "v-101", time: "09:00", client: "Residencial Miramar", pool: "Piscina comunitaria", address: "Av. del Mar, 18", technician: "Lucía Torres", status: "En curso", instructions: "Acceso por conserjería. Revisar filtro tras el temporal." },
  { id: "v-102", time: "11:30", client: "Casa Sol", pool: "Piscina principal", address: "C/ Jazmín, 6", technician: "Lucía Torres", status: "Pendiente", instructions: "Avisar por el timbre lateral. Dejar la cubierta recogida." },
  { id: "v-103", time: "16:00", client: "Hotel Arena", pool: "Piscina exterior", address: "Paseo de la Playa, 4", technician: "Marcos Vela", status: "Pendiente", instructions: "Coordinar la visita con mantenimiento del hotel." },
];

export const seedInvoices: Invoice[] = [
  { id: "F-2026-084", client: "Residencial Miramar", period: "Septiembre 2026", total: 314.60, status: "Borrador" },
  { id: "F-2026-083", client: "Finca Los Olivos", period: "Septiembre 2026", total: 187.55, status: "Emitida" },
  { id: "F-2026-082", client: "Casa Sol", period: "Agosto 2026", total: 242.00, status: "Pendiente" },
];

export const clients = [
  { name: "Residencial Miramar", pools: 1, contract: "2 visitas/semana", next: "Hoy, 09:00", status: "Activo" },
  { name: "Casa Sol", pools: 1, contract: "1 visita/semana", next: "Hoy, 11:30", status: "Activo" },
  { name: "Hotel Arena", pools: 2, contract: "2 visitas/semana", next: "Hoy, 16:00", status: "Activo" },
  { name: "Finca Los Olivos", pools: 1, contract: "1 visita/semana", next: "Jueves, 10:00", status: "Activo" },
];

export const euros = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
