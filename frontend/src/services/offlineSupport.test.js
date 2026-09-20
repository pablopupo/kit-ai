import test from 'node:test'
import assert from 'node:assert/strict'
import { inspectOfflineSupport, offlineFailureReason, offlineReason, offlineSupportReport } from './offlineSupport.js'

test('secure-context and missing-worker checks describe the unavailable feature without browser assumptions', () => {
  const supported = { navigator: { serviceWorker: {} }, caches: {}, isSecureContext: true }
  assert.equal(inspectOfflineSupport(supported).reason, null)
  assert.deepEqual(inspectOfflineSupport(supported).support, { secureContext: true, serviceWorkerAvailable: true, cacheStorageAvailable: true })
  assert.equal(inspectOfflineSupport({ ...supported, isSecureContext: false }).reason, 'insecure-context')
  assert.equal(inspectOfflineSupport({ ...supported, isSecureContext: undefined }).reason, 'secure-context-unavailable')
  assert.equal(inspectOfflineSupport({ ...supported, navigator: {} }).reason, 'service-worker-unavailable')
})

test('blocked getters are read safely and no storage probes or writes are performed', () => {
  const nav = { get serviceWorker() { throw new DOMException('Private origin information', 'SecurityError') } }
  const result = inspectOfflineSupport({ navigator: nav, isSecureContext: true, get caches() { throw new DOMException('Denied', 'SecurityError') } })
  assert.equal(result.reason, 'service-worker-blocked')
  assert.deepEqual(result.support, { secureContext: true, serviceWorkerAvailable: false, cacheStorageAvailable: false })
  assert.equal(JSON.stringify(result).includes('Private'), false)
  let writes = 0
  inspectOfflineSupport({ navigator: { serviceWorker: { register() { writes++ } } }, caches: { open() { writes++ } }, isSecureContext: true })
  assert.equal(writes, 0)
})

test('unavailable window cache access does not prevent worker-based offline saving', () => {
  for (const environment of [
    { navigator: { serviceWorker: {} }, isSecureContext: true },
    { navigator: { serviceWorker: {} }, isSecureContext: true, get caches() { throw new DOMException('Denied', 'SecurityError') } },
  ]) {
    const result = inspectOfflineSupport(environment)
    assert.equal(result.reason, null)
    assert.equal(result.support.cacheStorageAvailable, false)
  }
})

test('reason and support serialization allow only known categories and booleans', () => {
  assert.equal(offlineReason('service-worker-blocked'), 'service-worker-blocked')
  assert.equal(offlineReason('https://private.test/?token=secret'), null)
  assert.deepEqual(offlineSupportReport({ secureContext: true, serviceWorkerAvailable: 'private', cacheStorageAvailable: false, private: 'secret' }), {
    secureContext: true, serviceWorkerAvailable: null, cacheStorageAvailable: false,
  })
  assert.equal(offlineFailureReason(new DOMException('private', 'SecurityError'), 'registration-failed'), 'registration-blocked')
  assert.equal(offlineFailureReason(new DOMException('private', 'QuotaExceededError'), 'save-check-failed'), 'storage-full')
})
