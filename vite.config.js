import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // The service worker is hand-written (src/sw.js) because it has to bypass
      // Firestore/Gemini/Maps traffic precisely; the plugin only injects the
      // precache manifest into it and emits the web app manifest.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      // Registration lives in src/shared/pwa.js so it can be guarded and wired
      // to the update prompt.
      injectRegister: false,
      registerType: 'prompt',
      // No includeAssets: the globPatterns below already sweep everything
      // public/ copies into dist, and listing a file twice makes the
      // service worker's cache.addAll reject on duplicate URLs.
      manifest: {
        id: '/',
        name: 'HealthMinute — Emergency Response',
        short_name: 'HealthMinute',
        description:
          'An emergency response platform that shortens the gap between an accident and medical help.',
        theme_color: '#4361ee',
        background_color: '#f4f6fb',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'en',
        categories: ['medical', 'health'],
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        // Classic worker rather than an ES module one: src/sw.js has no
        // imports, and module service workers still are not universal.
        rollupFormat: 'iife',
      },
      // A service worker in dev would sit in front of the HMR client, so it is
      // only built for production. `npm run preview` serves the real thing.
      devOptions: { enabled: false },
    }),
  ],
})
