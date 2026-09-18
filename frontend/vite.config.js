import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  optimizeDeps: {
    exclude: ['@mlc-ai/web-llm']
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'robots.txt', 'pwa-192x192.png', 'pwa-512x512.png', 'pwa-maskable-512x512.png', 'apple-touch-icon.png', 'fonts/*.woff2', 'medical-knowledge.json'],
      manifest: {
        name: 'KIT AI',
        short_name: 'KIT AI',
        description: 'Health questions and first-aid reference guides, with chat history on your device.',
        theme_color: '#E0F5F3',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        id: '/',
        scope: '/',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml'
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,wasm,json}'],
        // Download the large AI runtime only when someone enables local AI.
        globIgnores: ['**/webllmService-*.js', '**/webllm-worker-*.js'],
        runtimeCaching: [{
          urlPattern: ({ url }) => url.origin === self.location.origin && /\/assets\/webllm(?:Service|-worker)-.*\.js$/.test(url.pathname),
          handler: 'CacheFirst',
          options: {
            cacheName: 'kit-ai-model-runtime',
            expiration: { maxEntries: 8, maxAgeSeconds: 30 * 24 * 60 * 60, purgeOnQuotaError: true },
            cacheableResponse: { statuses: [200] },
          },
        }],
        navigateFallback: '/index.html',
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024
      }
    })
  ]
})
