import { checkWebGPUInWorker } from './webgpuSupport.js'
import { inspectOfflineSupport, offlineReason, offlineSupportReport } from './offlineSupport.js'

export const PHONE_TEST_PROMPTS = {
  en: 'This is a harmless app test. Reply only with: KIT LOCAL TEST.',
  es: 'Esta es una prueba inofensiva de la aplicación. Responde solo: PRUEBA LOCAL DE KIT.',
}
const numberOrNull = value => Number.isFinite(value) && value >= 0 ? value : null
const booleanOrNull = value => typeof value === 'boolean' ? value : null
const attempt = async task => { try { return await task() } catch { return null } }
const read = task => { try { return task() } catch { return undefined } }

/** Metadata only: no model imports, cache contents, network requests or writes. */
export async function inspectPhone(options = {}) {
  // Defaults must also be read inside the guard: restricted browser contexts can
  // throw when the storage or service-worker property itself is accessed.
  const nav = read(() => 'nav' in options ? options.nav : globalThis.navigator)
  const cacheStorage = read(() => 'cacheStorage' in options ? options.cacheStorage : globalThis.caches)
  const db = read(() => 'db' in options ? options.db : globalThis.indexedDB)
  const secureContext = read(() => 'secureContext' in options ? options.secureContext : globalThis.isSecureContext)
  const checkGPU = options.checkGPU || checkWebGPUInWorker
  const { support, reason, serviceWorker } = inspectOfflineSupport({ navigator: nav, caches: cacheStorage, isSecureContext: secureContext })
  const [gpu, estimate, persisted, registration, cacheNames, databases] = await Promise.all([
    attempt(checkGPU), attempt(() => nav?.storage?.estimate?.()),
    attempt(() => nav?.storage?.persisted?.()), attempt(() => serviceWorker?.getRegistration?.()),
    attempt(() => cacheStorage?.keys?.()), attempt(() => db?.databases?.()),
  ])
  return {
    checkedAt: new Date().toISOString(),
    ...support,
    offlineSupportReason: reason,
    browserReportsOnline: booleanOrNull(read(() => nav?.onLine)),
    workerWebGPU: booleanOrNull(gpu?.supported),
    serviceWorkerRegistered: serviceWorker ? (registration === null ? null : Boolean(registration)) : false,
    serviceWorkerControlsPage: serviceWorker ? booleanOrNull(read(() => Boolean(serviceWorker.controller))) : false,
    storage: { usageBytes: numberOrNull(estimate?.usage), quotaBytes: numberOrNull(estimate?.quota), persistent: booleanOrNull(persisted) },
    caches: {
      appCacheContainers: Array.isArray(cacheNames) ? cacheNames.filter(name => name.startsWith('workbox-precache') || name.startsWith('kit-ai-')).length : null,
      // Finding these databases never establishes completeness or the model version.
      modelContainers: Array.isArray(databases) ? ['webllm/model', 'webllm/config', 'webllm/wasm'].filter(name => databases.some(item => item.name === name)).length : null,
    },
  }
}

/** Call the existing local engine with a fixed prompt and NO conversation history. */
export async function runPhoneLocalTest({
  sendMessage, language = 'en', ready, signal, reopenedOffline = false,
  nav = globalThis.navigator, events = globalThis.window, now = () => performance.now(),
}) {
  const testLanguage = language === 'es' ? 'es' : 'en'
  const started = now()
  const onlineAtStart = booleanOrNull(nav?.onLine)
  let remainedOffline = onlineAtStart === false
  const sawOnline = () => { remainedOffline = false }
  const result = {
    startedAt: new Date().toISOString(), language: testLanguage,
    prompt: PHONE_TEST_PROMPTS[testLanguage], status: 'not-ready', response: null,
    elapsedMs: 0, browserOfflineThroughout: false,
    userConfirmedOfflineReopen: Boolean(reopenedOffline),
  }
  if (!ready || typeof sendMessage !== 'function') return result
  events?.addEventListener?.('online', sawOnline)
  try {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const response = await sendMessage(result.prompt, [], undefined, signal)
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (typeof response !== 'string' || !response.trim()) {
      result.status = 'empty-response'
    } else {
      result.status = 'passed'
      result.response = response.trim().slice(0, 4000)
    }
  } catch (error) {
    // Do not export arbitrary exception messages, stack traces, or request URLs.
    result.status = signal?.aborted || error?.name === 'AbortError' ? 'cancelled' : 'failed'
  } finally {
    events?.removeEventListener?.('online', sawOnline)
    result.elapsedMs = Math.max(0, Math.round(now() - started))
    result.browserOfflineThroughout = remainedOffline && nav?.onLine === false
  }
  return result
}

/** Explicit allowlist protects exports from accidental chat/state inclusion. */
export function makePhoneReport({ capabilities, result, offlineApp, configuredModel, includeBrowser = false, userAgent = '' }) {
  const report = {
    schema: 'kit-ai-device-check-v1', exportedAt: new Date().toISOString(),
    configuredModel: String(configuredModel || '').slice(0, 150),
    note: 'Synthetic local test only. Browser network flags and a self-reported reopen do not independently verify airplane mode. Cache containers do not prove complete artifacts. This does not evaluate medical accuracy.',
    capabilities: capabilities ? {
      checkedAt: capabilities.checkedAt,
      ...offlineSupportReport(capabilities),
      offlineSupportReason: offlineReason(capabilities.offlineSupportReason),
      browserReportsOnline: booleanOrNull(capabilities.browserReportsOnline),
      workerWebGPU: booleanOrNull(capabilities.workerWebGPU),
      serviceWorkerRegistered: booleanOrNull(capabilities.serviceWorkerRegistered),
      serviceWorkerControlsPage: booleanOrNull(capabilities.serviceWorkerControlsPage),
      storage: { usageBytes: numberOrNull(capabilities.storage?.usageBytes), quotaBytes: numberOrNull(capabilities.storage?.quotaBytes), persistent: booleanOrNull(capabilities.storage?.persistent) },
      caches: { appCacheContainers: numberOrNull(capabilities.caches?.appCacheContainers), modelContainers: numberOrNull(capabilities.caches?.modelContainers) },
    } : null,
    offlineApp: offlineApp ? {
      status: ['checking', 'saving', 'ready', 'waiting', 'error', 'unsupported'].includes(offlineApp.status) ? offlineApp.status : null,
      runtimeSaved: booleanOrNull(offlineApp.runtimeSaved),
      reason: offlineReason(offlineApp.reason),
      support: offlineApp.support ? offlineSupportReport(offlineApp.support) : null,
    } : null,
    localTest: result ? {
      startedAt: result.startedAt, language: result.language === 'es' ? 'es' : 'en',
      prompt: PHONE_TEST_PROMPTS[result.language === 'es' ? 'es' : 'en'],
      status: ['passed', 'failed', 'cancelled', 'empty-response', 'not-ready'].includes(result.status) ? result.status : 'failed',
      response: result.status === 'passed' && typeof result.response === 'string' ? result.response.slice(0, 4000) : null,
      elapsedMs: numberOrNull(result.elapsedMs), browserOfflineThroughout: Boolean(result.browserOfflineThroughout),
      userConfirmedOfflineReopen: Boolean(result.userConfirmedOfflineReopen),
    } : null,
  }
  if (includeBrowser) report.browserUserAgent = String(userAgent).slice(0, 500)
  return report
}

export async function copyPhoneReport(text, clipboard) {
  try {
    clipboard ??= globalThis.navigator?.clipboard
    if (typeof clipboard?.writeText !== 'function') return false
    await clipboard.writeText(text)
    return true
  } catch { return false }
}
