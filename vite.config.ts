/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

/**
 * One codebase, two separate PWAs chosen at build time:
 *  - gym  (default): "جيمي" — workouts, nutrition, body. dist/, public/
 *  - life (VITE_APP=life): "ELSYYAAD Life OS". dist-life/, public-life/
 * Each is deployed as its own Cloudflare Worker, so each has its own origin, icon and data.
 */
const APP = process.env.VITE_APP === 'life' ? 'life' : 'gym'

const META = {
  gym: { title: 'جيمي', name: 'جيمي — متابعة التمرين', short: 'جيمي', description: 'متابعة التمرين وقياسات InBody بدون إنترنت' },
  life: { title: 'ELSYYAAD Life OS', name: 'ELSYYAAD Life OS', short: 'Life OS', description: 'نظام تشغيل شخصي: يومك، مشاريعك، أهدافك وعاداتك — بدون إنترنت' },
}[APP]

const html: Plugin = {
  name: 'app-title',
  transformIndexHtml: (s) => s.replaceAll('%APP_TITLE%', META.title),
}

export default defineConfig({
  base: './',
  publicDir: APP === 'life' ? 'public-life' : 'public',
  build: { outDir: APP === 'life' ? 'dist-life' : 'dist' },
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: {
    alias: { '@app': fileURLToPath(new URL(APP === 'life' ? './src/life/LifeApp.tsx' : './src/App.tsx', import.meta.url)) },
  },
  plugins: [
    react(),
    html,
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: {
        name: META.name,
        short_name: META.short,
        description: META.description,
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
        // Life OS: notification taps focus/open the app (public-life/sw-notify.js).
        ...(APP === 'life' ? { importScripts: ['sw-notify.js'] } : {}),
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
