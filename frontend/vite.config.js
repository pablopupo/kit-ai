import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { webllmGpuLimitsPatch } from './build/webllmGpuLimitsPatch.js'
import { webllmMemoryPatch } from './build/webllmMemoryPatch.js'

export default defineConfig({
  worker: { plugins: () => [webllmGpuLimitsPatch(), webllmMemoryPatch()] },
  optimizeDeps: {
    exclude: ['@mlc-ai/web-llm']
  },
  plugins: [
    webllmGpuLimitsPatch(),
    webllmMemoryPatch(),
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectRegister: false,
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'robots.txt', 'pwa-192x192.png', 'pwa-512x512.png', 'pwa-maskable-512x512.png', 'apple-touch-icon.png', 'fonts/*.woff2'],
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
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,wasm,json}'],
        globIgnores: ['**/medical-knowledge.json', '**/packs/**'],
        // The custom worker saves the small app first. Assistant code is saved
        // separately before its weights are downloaded; it cannot block guides.
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024
      }
    })
  ]
})
