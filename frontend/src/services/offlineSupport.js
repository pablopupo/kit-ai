const supportReasons = [
  'insecure-context', 'secure-context-unavailable',
  'service-worker-unavailable', 'service-worker-blocked',
  'cache-storage-unavailable', 'cache-storage-blocked',
]
const failureReasons = [
  ...supportReasons, 'registration-blocked', 'registration-failed',
  'save-check-failed', 'save-check-timeout', 'app-files-missing',
  'install-failed', 'save-timeout', 'runtime-save-failed', 'storage-full',
]
export const offlineReason = value => failureReasons.includes(value) ? value : null
const booleanOrNull = value => typeof value === 'boolean' ? value : null
const read = task => { try { return { value: task(), blocked: false } } catch { return { value: undefined, blocked: true } } }

/** Inspect exposed APIs only. Never writes storage, registers a worker, or requests persistence. */
export function inspectOfflineSupport(environment = globalThis) {
  const secure = read(() => environment.isSecureContext)
  const navigator = read(() => environment.navigator)
  // A present property can still throw SecurityError when it is read.
  const worker = read(() => navigator.value?.serviceWorker)
  const cache = read(() => environment.caches)
  const support = {
    secureContext: booleanOrNull(secure.value),
    serviceWorkerAvailable: Boolean(worker.value),
    cacheStorageAvailable: Boolean(cache.value),
  }
  const reason = support.secureContext === false ? 'insecure-context'
    : support.secureContext !== true ? 'secure-context-unavailable'
      : navigator.blocked || worker.blocked ? 'service-worker-blocked'
        : !support.serviceWorkerAvailable ? 'service-worker-unavailable' : null
  return { support, reason, serviceWorker: worker.value, cacheStorage: cache.value }
}

/** Keep exported diagnostics categorical and independent of arbitrary browser errors. */
export function offlineSupportReport(support) {
  return {
    secureContext: booleanOrNull(support?.secureContext),
    serviceWorkerAvailable: booleanOrNull(support?.serviceWorkerAvailable),
    cacheStorageAvailable: booleanOrNull(support?.cacheStorageAvailable),
  }
}

export function offlineFailureReason(error, fallback) {
  if (error?.name === 'QuotaExceededError') return 'storage-full'
  if (fallback === 'registration-failed' && ['SecurityError', 'NotAllowedError'].includes(error?.name)) return 'registration-blocked'
  return offlineReason(fallback)
}
