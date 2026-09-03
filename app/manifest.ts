import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Concepte Blau · Gestión de piscinas',
    short_name: 'Concepte Blau',
    description: 'Gestión de mantenimiento, visitas, clientes y facturación de piscinas.',
    id: '/',
    start_url: '/',
    scope: '/',
    lang: 'es',
    display: 'standalone',
    background_color: '#f4f8fb',
    theme_color: '#073964',
    categories: ['business', 'productivity'],
    icons: [
      {
        src: '/pwa-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/pwa-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  }
}
