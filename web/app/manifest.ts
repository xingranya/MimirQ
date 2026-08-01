import type { MetadataRoute } from 'next'
import { BRAND_CONFIG } from '@/lib/brand'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND_CONFIG.name,
    short_name: BRAND_CONFIG.shortName,
    description: BRAND_CONFIG.description,
    start_url: '/',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#2563eb',
    icons: [
      {
        src: BRAND_CONFIG.markSrc,
        sizes: '300x300',
        type: 'image/png',
      },
      {
        src: BRAND_CONFIG.markSrc,
        sizes: '300x300',
        type: 'image/png',
      },
    ],
  }
}
