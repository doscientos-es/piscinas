import { describe, expect, it } from 'vitest'

import manifest from './manifest'

describe('PWA manifest', () => {
  it('defines the installed Concepte Blau application', () => {
    const result = manifest()

    expect(result).toMatchObject({
      name: 'Concepte Blau · Gestión de piscinas',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      theme_color: '#073964',
    })
    expect(result.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: '/pwa-icon.svg', purpose: 'any' }),
        expect.objectContaining({ src: '/pwa-icon.svg', purpose: 'maskable' }),
      ]),
    )
  })
})
