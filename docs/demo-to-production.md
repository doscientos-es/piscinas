# De demo a producción

## Se conserva

- Rutas, estructura de componentes, tipos de dominio y experiencia móvil del parte.
- Contratos de `Visit` e `Invoice` como punto de partida para los modelos reales.
- Tokens semánticos y componentes visuales.

## Sustituir los mocks

1. Implementar Supabase con RLS para usuarios, clientes, instalaciones, contratos, visitas, intervenciones, consumos y facturas.
2. Reemplazar los datos de `lib/demo-data.ts` por repositorios de dominio y adaptadores Supabase.
3. Añadir autenticación por rol (administrador, técnico y gestoría).
4. Integrar proveedor de email y almacenamiento de fotos mediante adaptadores; mantener registro de resultado de envío.
5. Generar PDF y numeración fiscal en el servidor, tras validar series y normativa aplicable.

## Decisiones pendientes

- Proveedor de comunicaciones y costes.
- Requisitos fiscales/Facturae y formato bancario SEPA.
- Volumen de datos, campos reales de Excel e histórico migrable.
