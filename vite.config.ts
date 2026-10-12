/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: {
        name: 'جيمي — متابعة التمرين',
        short_name: 'جيمي',
        description: 'متابعة التمرين وقياسات InBody بدون إنترنت',
        lang: 'ar',
        dir: 'rtl',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#dff3ec',
        theme_color: '#dff3ec',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache only the app shell (~0.5 MB) so install is fast and can't be sunk by one
        // of 100+ images failing on a flaky connection. Images are cached at runtime and
        // warmed in the background by the page (src/lib/offline.ts).
        globPatterns: ['**/*.{js,css,html,woff2}', 'icons/*.{png,svg}'],
        globIgnores: ['exercises/**'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // Take control of the already-open page right after install, so a first launch
        // becomes offline-capable without needing a reload (iOS rarely reloads a home-screen app).
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/exercises/'),
            handler: 'CacheFirst',
            options: { cacheName: 'exercise-images', cacheableResponse: { statuses: [200] } },
          },
        ],
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
