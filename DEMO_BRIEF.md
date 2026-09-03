# Demo · Gestión del mantenimiento de piscinas

## Contexto del cliente

- Empresa: Concepte Blau, negocio pequeño dedicado a tienda, construcción y mantenimiento de piscinas. El MVP se limita al mantenimiento.
- Interlocutor: Carles Marin. Equipo indicado en el descubrimiento: dos personas de administración y dos operarios.
- Situación actual: utilizan un ERP generalista (DAF Win) que no encaja con su operativa. Hoy acumulan trabajo manual al facturar y al contrastar cobros.
- Prioridad: una primera versión propia, sencilla y funcional que automatice lo repetitivo sin exigir conocimientos informáticos al personal de campo.

## Identidad aplicada

- Marca: Concepte Blau.
- Logo: activo oficial publicado en `concepteblau.cat`, guardado localmente para la demo.
- Tokens: azul marino `#052e5a` y cian `#00aeef`, con contraste de texto comprobable sobre los fondos principales.

## Requisitos confirmados

### Operativa de mantenimiento

- Gestionar clientes, instalaciones/piscinas, proveedores, catálogo de productos y contratos de mantenimiento.
- Los contratos generan una o dos visitas semanales, con tareas preparadas para cada piscina.
- El técnico consulta sus visitas desde móvil o tableta, identifica claramente la piscina y abre/cierra el parte en pocos pasos.
- En la intervención registra tareas, lecturas de agua —como cloro, pH y alcalinidad—, incidencias, reparaciones y productos usados.
- Los productos y trabajos fuera de contrato se convierten en conceptos pendientes de facturar; la cuota mensual es independiente.

### Facturación y cobros

- Al cierre de mes se factura el mes anterior: cuota de contrato más productos y extras pendientes, sin duplicar conceptos.
- Debe poder emitirse una factura puntual desde móvil o tableta para trabajos sin contrato y cobrarla con datáfono.
- Hay clientes con domiciliación bancaria y otros —por ejemplo comunidades— que reciben factura por correo para pagar mediante transferencia.
- Administración necesita ver qué facturas están cobradas, pendientes, devueltas o requieren reclamación.
- La gestoría debe recibir las facturas por correo o disponer de acceso limitado al área administrativa; no necesita la operativa de piscinas.

### Comunicación y perfiles

- Al cerrar un servicio se quiere avisar al cliente por email, WhatsApp o SMS e informarle de que la visita se ha realizado.
- Perfiles previstos: administración, técnico y gestoría, con acceso mínimo según su función.
- La experiencia del técnico prima la simplicidad: tareas y productos reconocibles, poca escritura y buen uso en tableta.

## Alcance demostrable hoy

1. Registro e inicio de sesión con Supabase; el primer perfil creado obtiene el rol de administración en el entorno de demo.
2. Consulta de agenda de visitas vinculada a instalación y cliente, y cierre básico del parte.
3. Consulta de clientes, instalaciones y método de cobro.
4. Consulta de facturas y marcado manual de factura como cobrada.
5. Persistencia de estas acciones en Supabase con datos de ejemplo y políticas RLS de base.

## Límites explícitos de la demo

- El cierre del parte aún no captura desde la interfaz tareas, lecturas, productos, incidencias ni fotos, aunque el modelo de datos contempla gran parte de ello.
- No hay generación por lote de facturas, cálculo de cuota más extras, PDF fiscal, numeración definitiva ni prevención transaccional de duplicados.
- No están conectados email, WhatsApp, SMS, banco/SEPA, datáfono, almacenamiento de fotos ni importación de Excel.
- La gestión de roles y permisos es una base técnica de demostración; el alta pública no es el flujo previsto para producción.
- Los datos cargados son de ejemplo, pero ya se guardan en Supabase: no deben confundirse con datos reales del cliente.

## Fase posterior, fuera del MVP inicial

- Rentabilidad por cliente, ruta, operario, vehículo, kilómetros, combustible y tiempo de trabajo.
- Optimización de rutas y seguimiento GPS de vehículos.
- Reventa o personalización del software para otras empresas del sector.
- Tienda online y necesidades de la línea de construcción.

## Criterio de éxito de la demo

- Carles puede seguir el recorrido de una visita y entender cómo los consumos llegan a facturación.
- El equipo valida que el flujo de técnico sea más fácil que el uso actual de hojas de cálculo/ERP.
- Se identifican las decisiones necesarias para una propuesta técnica y económica cerrada.

## Pendientes de validación para producción

- Plantillas reales por tipo de piscina, reglas de agenda, festivos, excepciones y datos que debe ver cada técnico.
- Formato y calidad de los Excel actuales, histórico que se quiere conservar y catálogo definitivo de productos/proveedores.
- Series, impuestos, vencimientos, textos legales y normativa fiscal aplicable; incluido si procede Veri*Factu, Facturae o SII.
- Banco/esquema SEPA, tratamiento de devoluciones, proveedor y operativa de datáfono.
- Canal de aviso prioritario, consentimiento y plantillas para email, WhatsApp o SMS.
