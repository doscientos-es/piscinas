# De demo a producción

## Punto de partida real

La demo ya usa Next.js y Supabase. Dispone de autenticación, una semilla de ejemplo y tablas con RLS para perfiles, clientes, instalaciones, contratos, plantillas, productos, visitas, intervenciones, consumos, conceptos facturables y facturas.

La interfaz actual permite iniciar sesión, consultar agenda, clientes y facturas, cerrar una visita de forma básica y marcar manualmente un cobro. Es una base funcional de validación, no un sistema fiscal ni de explotación.

## Se conserva

- Arquitectura de rutas, componentes visuales y experiencia de agenda enfocada a móvil/tableta.
- Modelo relacional inicial de clientes, instalaciones, contratos, visitas, intervenciones, productos, conceptos pendientes, facturas y líneas.
- Separación inicial de perfiles de administración, técnico y gestoría, junto con la intención de RLS.
- Identidad visual, tokens semánticos y datos de semilla exclusivamente para demostración.

## Brechas que hay que cerrar antes de operar

### Seguridad, acceso y datos

1. Sustituir el alta abierta y la asignación automática del primer administrador por invitaciones y aprovisionamiento controlado de usuarios.
2. Completar y probar las políticas RLS para los tres perfiles, incluida la lectura limitada de facturas para gestoría. Aplicar autorización también en las operaciones de servidor.
3. Añadir organización/aislamiento de datos si se confirma la futura explotación para más empresas; para Concepte Blau, documentar el modelo de propiedad y acceso interno.
4. Definir auditoría, retención, copias de seguridad, respuesta ante incidencias y obligaciones RGPD antes de cargar datos reales.

### Operativa de técnicos

1. Construir el parte completo: inicio/fin, checklist por plantilla, cloro/pH/alcalinidad, incidencias, reparación, observaciones, productos y fotos.
2. Diseñar la agenda recurrente de contratos de una o dos visitas semanales, incluyendo reprogramaciones, cancelaciones y excepciones.
3. Mantener la interfaz de campo muy guiada: piscina identificable, acciones grandes, escasa escritura y comportamiento validado en tableta.
4. Al cerrar una intervención, crear de forma transaccional los conceptos facturables de productos y extras, conservando precio, IVA y trazabilidad del parte.

### Facturación, cobro y comunicación

1. Implementar en servidor el cierre mensual por cliente: cuota del contrato más conceptos pendientes, bloqueo/estado de los conceptos y protección frente a dobles ejecuciones.
2. Crear factura puntual para trabajos sin contrato, con flujo de cobro por datáfono una vez elegido el proveedor.
3. Generar PDF, numeración y rectificaciones en servidor solo después de validar series, impuestos, vencimientos y normativa fiscal aplicable.
4. Integrar remesas SEPA, conciliación de ingresos, devoluciones y reclamación de impagados cuando estén definidos banco y proceso operativo.
5. Integrar el canal de notificación elegido (email, WhatsApp o SMS), plantillas aprobadas, consentimiento y registro de entrega/error; las fotos deben ir a almacenamiento privado.
6. Añadir entrega o acceso de gestoría a facturas, con permisos y exportaciones acordados.

## Plan de entrega recomendado

| Fase                      | Resultado verificable                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------- |
| 0. Descubrimiento         | Excel y esquema revisados; reglas de contrato, facturación, fiscalidad, cobro y comunicaciones aprobadas. |
| 1. Base segura            | Usuarios invitados, perfiles/RLS probados, importación piloto y clientes/instalaciones/contratos reales.  |
| 2. Operativa              | Agenda recurrente y parte completo en tableta; productos y extras dejan conceptos pendientes trazables.   |
| 3. Administración         | Facturación mensual y puntual, PDF y seguimiento de cobros conforme a las decisiones fiscales.            |
| 4. Integraciones y salida | Comunicación, SEPA/datáfono si se aprueban, migración final, formación, aceptación y copias de seguridad. |

Cada fase debe validarse con un conjunto representativo de clientes, contratos, intervenciones y facturas antes de incorporar todo el histórico.

## Decisiones que bloquean el cierre técnico y económico

- Muestra de los Excel y del esquema compartido por Carles: campos, calidad, volumen e histórico que se migra.
- Plantillas de mantenimiento, reglas de periodicidad y excepciones de agenda.
- Series y datos fiscales, reglas de IVA, requisito de PDF/factura electrónica y normativa aplicable.
- Banco, formato SEPA, gestión de devoluciones y proveedor/operativa del datáfono.
- Canal de comunicación, costes, consentimiento, textos y destinatarios de cada aviso.
- Alcance de gestoría: acceso, exportación, periodicidad y responsabilidad de conciliación.

## Fuera de esta primera producción

Rentabilidad por cliente y ruta, GPS/vehículos, optimización de desplazamientos, tienda online, construcción y comercialización a terceros se estimarán como evoluciones independientes tras estabilizar la operación de mantenimiento.
