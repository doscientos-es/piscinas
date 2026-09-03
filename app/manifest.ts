import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Concepte Blau · Gestió de piscines',
    short_name: 'Concepte Blau',
    description: 'Gestió del manteniment, visites, clients i facturació de piscines.',
    id: '/',
    start_url: '/',
    scope: '/',
    lang: 'ca',
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
