# Concepte Blau · Gestión de piscinas

Demo local del MVP para operativa de técnicos, consumos y facturación.

La identidad visual usa los azules del logotipo oficial publicado en [concepteblau.cat](https://concepteblau.cat/): azul marino `#052e5a` como color principal y cian `#00aeef` como accent. El logo se conserva localmente en `public/concepte-blau-logo.png`.

## Arranque

Requiere Node.js 22+ y pnpm.

```sh
pnpm install
cp .env.example .env.local
pnpm dev
```

Abre `http://localhost:3000`.

La demo requiere un proyecto de Supabase configurado y guarda allí los cambios de la sesión. Usa exclusivamente datos sintéticos en un proyecto de demostración: iniciar o cerrar una visita, registrar consumos, editar clientes, actualizar facturas o marcar un cobro modifica esos datos. El primer usuario registrado en una base de demo vacía recibe el rol de administración; los siguientes reciben el rol de técnico.

## Inventario

La ruta `/inventario` permite crear, editar y retirar materiales de mantenimiento, con existencias, nivel mínimo, coste y precio de venta sin IVA. Incluye referencia, EAN, proveedor, pedido mínimo y unidades por palé, con búsqueda y filtro por categoría. Las entradas y ajustes quedan registrados en un historial; al cerrar un parte, el consumo descuenta stock, conserva el precio de venta y genera la línea pendiente para facturación.

Antes de usarla contra Supabase, aplica las migraciones versionadas de inventario en el entorno correspondiente. La ampliación del catálogo de Embajador/Bayrol está en `supabase/migrations/20260903123000_extend_product_catalog_for_supplier_price_list.sql` y `supabase/migrations/20260903123500_import_embajador_2026_catalog.sql`; esta última incorpora las referencias y sus tramos de compra. Incluyen RLS y permisos: sólo los administradores pueden cambiar materiales o inventario; los técnicos siguen pudiendo consultar el catálogo necesario durante sus visitas.

## Correo transaccional

La interfaz actual no envía correos. La dependencia y las variables de Resend quedan reservadas para una futura integración desde servidor; `RESEND_API_KEY` debe mantenerse sólo en `.env.local` durante el desarrollo local y nunca exponerse al navegador.

## Calidad

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Límites de la demo

Incluye autenticación y persistencia en Supabase para datos de ejemplo, pero no envío de emails, PDF fiscal, fotos, SEPA, WhatsApp ni importación de Excel. Consulta [la ruta de evolución](docs/demo-to-production.md) antes de conectar servicios reales.
