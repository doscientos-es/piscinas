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

`DEMO_MODE=true` indica que los datos, factura, correo y cobro son simulados: no hay integraciones externas ni persistencia.

## Inventario

La ruta `/inventario` permite crear, editar y retirar materiales de mantenimiento, con existencias, nivel mínimo, coste y precio de venta sin IVA. Incluye referencia, EAN, proveedor, pedido mínimo y unidades por palé, con búsqueda y filtro por categoría. Las entradas y ajustes quedan registrados en un historial; al cerrar un parte, el consumo descuenta stock, conserva el precio de venta y genera la línea pendiente para facturación.

Antes de usarla contra Supabase, aplica las migraciones versionadas de inventario en el entorno correspondiente. La ampliación del catálogo de Embajador/Bayrol está en `supabase/migrations/20260903123000_extend_product_catalog_for_supplier_price_list.sql` y `supabase/migrations/20260903123500_import_embajador_2026_catalog.sql`; esta última incorpora las referencias y sus tramos de compra. Incluyen RLS y permisos: sólo los administradores pueden cambiar materiales o inventario; los técnicos siguen pudiendo consultar el catálogo necesario durante sus visitas.

## Correo transaccional

El proyecto queda preparado para usar Resend desde código de servidor con el paquete `resend`. La clave `RESEND_API_KEY` está configurada como secreto en Vercel para producción, preview y desarrollo, y debe mantenerse sólo en `.env.local` durante el desarrollo local.

Para simular el flujo se usa `RESEND_FROM="Piscinas <onboarding@resend.dev>"`. Ese remitente de pruebas sólo puede enviar al correo asociado a la cuenta de Resend; las direcciones ficticias se emplearán únicamente para datos y estados simulados. Antes de activar envíos a clientes, verifica un dominio en Resend y sustituye la variable por `Nombre <remitente@dominio-verificado>`. No se usa ninguna clave de Resend en el navegador, GitHub Actions ni Supabase mientras los correos se envíen desde Next.js.

## Calidad

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Límites de la demo

No incluye autenticación real, envío de emails, PDF fiscal, fotos, SEPA, WhatsApp ni importación de Excel. Consulta [la ruta de evolución](docs/demo-to-production.md) antes de conectar servicios reales.
