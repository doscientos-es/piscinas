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

## Calidad

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Límites de la demo

No incluye autenticación real, envío de emails, PDF fiscal, fotos, SEPA, WhatsApp, importación de Excel ni base de datos. Consulta [la ruta de evolución](docs/demo-to-production.md) antes de conectar servicios reales.
