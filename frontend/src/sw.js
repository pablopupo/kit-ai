import { clientsClaim, cacheNames } from 'workbox-core'
import { precacheAndRoute, createHandlerBoundToURL, getCacheKeyForURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { OFFLINE_PROTOCOL, splitOfflineAssets, allAssetsSaved } from './services/offlineCachePolicy'

const assets = splitOfflineAssets(self.__WB_MANIFEST)
const runtimeCacheName = 'kit-ai-assistant-runtime-v2'
const saves = new Map()
precacheAndRoute(assets.app)
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))
// Claim the first visit only after every small app asset is saved successfully.
self.skipWaiting()
clientsClaim()

async function appCache() { return caches.open(cacheNames.precache) }
async function checkSaved() {
  const app = await appCache()
  const runtime = await caches.open(runtimeCacheName)
  return {
    protocol: OFFLINE_PROTOCOL,
    appSaved: await allAssetsSaved(assets.app, url => app.match(getCacheKeyForURL(url))),
    runtimeSaved: await allAssetsSaved(assets.assistant, url => runtime.match(new URL(url, self.location).href)),
  }
}

async function saveResponse(cache, url, cacheKey = url, signal) {
  const existing = await cache.match(cacheKey)
  if (existing?.status === 200) return existing
  const response = await fetch(new Request(url, { cache: 'reload', credentials: 'same-origin', signal }))
  if (response.status !== 200) throw new Error('File could not be saved')
  await cache.put(cacheKey, response.clone())
  return response
}

registerRoute(({ url }) => url.origin === self.location.origin && assets.assistant.some(entry => new URL(entry.url, self.location).href === url.href), async ({ request }) => {
  const cache = await caches.open(runtimeCacheName)
  return saveResponse(cache, request.url)
})

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') { self.skipWaiting(); return }
  const key = `${event.source?.id}:${event.data?.requestId}`
  if (event.data?.type === 'KIT_CANCEL_SAVE') { saves.get(key)?.abort(); return }
  if (!['KIT_OFFLINE_STATUS', 'KIT_SAVE_RUNTIME'].includes(event.data?.type) || !event.ports?.[0]) return
  const controller = new AbortController()
  if (event.data.type === 'KIT_SAVE_RUNTIME') saves.set(key, controller)
  event.waitUntil((async () => {
    try {
      if (event.data.type === 'KIT_SAVE_RUNTIME') {
        const cache = await caches.open(runtimeCacheName)
        for (const entry of assets.assistant) {
          if (controller.signal.aborted) throw new Error('Paused')
          const url = new URL(entry.url, self.location).href
          await saveResponse(cache, url, url, controller.signal)
        }
      }
      event.ports[0].postMessage(await checkSaved())
    } catch {
      event.ports[0].postMessage({ protocol: OFFLINE_PROTOCOL, appSaved: false, runtimeSaved: false, failed: true })
    } finally { saves.delete(key) }
  })())
})
