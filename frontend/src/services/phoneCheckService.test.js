import test from 'node:test'
import assert from 'node:assert/strict'
import { copyPhoneReport, inspectPhone, makePhoneReport, PHONE_TEST_PROMPTS, runPhoneLocalTest } from './phoneCheckService.js'

test('capability checks use read-only metadata, tolerate denied storage, and never declare a local pass', async () => {
  let writes = 0
  const capabilities = await inspectPhone({
    checkGPU: async () => ({ supported: true }), secureContext: true,
    nav: { onLine: false, storage: {
      estimate: async () => { throw new Error('Denied') }, persisted: async () => false,
      persist: () => { writes++ },
    }, serviceWorker: { controller: {}, getRegistration: async () => ({ active: {} }) } },
    cacheStorage: { keys: async () => ['workbox-precache-v2-https://kit.test/', 'other-private-cache'], open: () => { writes++ } },
    db: { databases: async () => [{ name: 'webllm/model' }, { name: 'webllm/config' }, { name: 'chat-data' }], open: () => { writes++ } },
  })
  assert.equal(writes, 0)
  assert.equal(capabilities.workerWebGPU, true)
  assert.equal(capabilities.serviceWorkerAvailable, true)
  assert.equal(capabilities.cacheStorageAvailable, true)
  assert.deepEqual(capabilities.storage, { usageBytes: null, quotaBytes: null, persistent: false })
  assert.deepEqual(capabilities.caches, { appCacheContainers: 1, modelContainers: 2 })
  const report = makePhoneReport({ capabilities })
  assert.equal(report.localTest, null)
  assert.equal(JSON.stringify(report).includes('chat-data'), false)
  assert.equal(JSON.stringify(report).includes('other-private-cache'), false)
})

test('unsupported browser and failed probes remain unavailable rather than passing', async () => {
  const capabilities = await inspectPhone({ nav: {}, cacheStorage: {}, db: {}, secureContext: false, checkGPU: async () => { throw new Error('Worker blocked') } })
  assert.equal(capabilities.workerWebGPU, null)
  assert.equal(capabilities.serviceWorkerAvailable, false)
  assert.equal(capabilities.offlineSupportReason, 'insecure-context')
  assert.equal(capabilities.serviceWorkerControlsPage, false)
  assert.equal(capabilities.serviceWorkerRegistered, false)
  assert.equal(capabilities.storage.persistent, null)
  assert.deepEqual(capabilities.caches, { appCacheContainers: null, modelContainers: null })
  assert.equal(makePhoneReport({ capabilities }).localTest, null)
})

test('capability inspection tolerates blocked service-worker and default storage getters', async t => {
  const savedGlobals = Object.fromEntries(['caches', 'indexedDB'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  t.after(() => {
    for (const [key, descriptor] of Object.entries(savedGlobals)) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]
  })
  for (const key of ['caches', 'indexedDB']) Object.defineProperty(globalThis, key, { configurable: true, get() { throw new DOMException('Private storage information', 'SecurityError') } })
  const capabilities = await inspectPhone({
    nav: { onLine: true, get serviceWorker() { throw new DOMException('Private browser information', 'SecurityError') } },
    secureContext: true, checkGPU: async () => ({ supported: true }),
  })
  assert.equal(capabilities.serviceWorkerAvailable, false)
  assert.equal(capabilities.cacheStorageAvailable, false)
  assert.equal(capabilities.serviceWorkerRegistered, false)
  assert.equal(capabilities.offlineSupportReason, 'service-worker-blocked')
  assert.equal(capabilities.caches.appCacheContainers, null)
  assert.equal(capabilities.caches.modelContainers, null)
  assert.equal(JSON.stringify(makePhoneReport({ capabilities })).includes('Private'), false)
})

test('fresh local tests use only the fixed selected-language prompt and empty history', async () => {
  for (const language of ['en', 'es', 'unsupported']) {
    const controller = new AbortController()
    let clock = 100
    let calls = 0
    const result = await runPhoneLocalTest({
      language, ready: true, signal: controller.signal, nav: { onLine: true }, events: new EventTarget(), now: () => clock,
      sendMessage: async (prompt, history, stream, signal) => {
        calls++
        assert.equal(prompt, PHONE_TEST_PROMPTS[language === 'es' ? 'es' : 'en'])
        assert.deepEqual(history, [])
        assert.equal(stream, undefined)
        assert.equal(signal, controller.signal)
        clock += 2450
        return '  A fresh synthetic response  '
      },
    })
    assert.equal(calls, 1)
    assert.equal(result.status, 'passed')
    assert.equal(result.response, 'A fresh synthetic response')
    assert.equal(result.elapsedMs, 2450)
    assert.equal(result.browserOfflineThroughout, false)
  }
})

test('not-ready, empty, failed and cancelled runs cannot produce a pass or reuse an old response', async () => {
  let calls = 0
  const notReady = await runPhoneLocalTest({ ready: false, sendMessage: async () => { calls++; return 'Unexpected' } })
  assert.equal(notReady.status, 'not-ready')
  assert.equal(calls, 0)
  for (const [response, status] of [['', 'empty-response'], ['  ', 'empty-response'], [null, 'empty-response']]) {
    const result = await runPhoneLocalTest({ ready: true, sendMessage: async () => response })
    assert.equal(result.status, status)
    assert.equal(result.response, null)
  }
  const failed = await runPhoneLocalTest({ ready: true, sendMessage: async () => { throw new Error('Sensitive server URL') } })
  assert.equal(failed.status, 'failed')
  assert.equal(JSON.stringify(failed).includes('Sensitive'), false)
  const controller = new AbortController()
  const stopped = await runPhoneLocalTest({ ready: true, signal: controller.signal, sendMessage: async () => { controller.abort(); return 'Late text' } })
  assert.equal(stopped.status, 'cancelled')
  assert.equal(stopped.response, null)
  const alreadyStopped = await runPhoneLocalTest({ ready: true, signal: controller.signal, sendMessage: async () => { calls++; return 'Unexpected' } })
  assert.equal(alreadyStopped.status, 'cancelled')
  assert.equal(calls, 0)
})

test('network changes during generation invalidate offline evidence, even when offline again at completion', async () => {
  const events = new EventTarget()
  const nav = { onLine: false }
  const common = { ready: true, nav, events, reopenedOffline: true }
  const changed = await runPhoneLocalTest({ ...common, sendMessage: async () => {
    nav.onLine = true
    events.dispatchEvent(new Event('online'))
    nav.onLine = false
    return 'Fresh response'
  } })
  assert.equal(changed.status, 'passed')
  assert.equal(changed.browserOfflineThroughout, false)
  assert.equal(changed.userConfirmedOfflineReopen, true)
  const offline = await runPhoneLocalTest({ ...common, sendMessage: async () => 'Another fresh response' })
  assert.equal(offline.status, 'passed')
  assert.equal(offline.browserOfflineThroughout, true)
  assert.equal(offline.userConfirmedOfflineReopen, true)
  assert.equal('airplaneModeVerified' in offline, false)
})

test('diagnostic exports explicitly exclude conversations, arbitrary state, and browser identity unless chosen', () => {
  const result = { status: 'passed', language: 'es', prompt: 'A private question', response: 'PRUEBA LOCAL DE KIT.', elapsedMs: 500, conversations: ['Private history'], error: 'Private failure' }
  const capabilities = { workerWebGPU: true, storage: { usageBytes: 12, token: 'Private key' }, chats: ['Private conversation'] }
  const offlineApp = { status: 'unsupported', runtimeSaved: false, reason: 'service-worker-unavailable', support: { secureContext: true, serviceWorkerAvailable: false, cacheStorageAvailable: false, url: 'Private origin' }, error: 'Private exception', conversations: ['Private history'] }
  const report = makePhoneReport({ result, capabilities, offlineApp, configuredModel: 'Configured test model', userAgent: 'Browser identity', chats: ['Private chat'] })
  const json = JSON.stringify(report)
  assert.equal(json.includes('Private'), false)
  assert.equal(json.includes('private'), false)
  assert.equal(json.includes('Browser identity'), false)
  assert.equal(report.localTest.prompt, PHONE_TEST_PROMPTS.es)
  assert.equal(report.localTest.response, 'PRUEBA LOCAL DE KIT.')
  assert.deepEqual(report.offlineApp, { status: 'unsupported', runtimeSaved: false, reason: 'service-worker-unavailable', support: { secureContext: true, serviceWorkerAvailable: false, cacheStorageAvailable: false } })
  const arbitrary = makePhoneReport({ offlineApp: { status: 'Private', reason: 'Private', runtimeSaved: 'Private' }, capabilities: { offlineSupportReason: 'Private' } })
  assert.equal(JSON.stringify(arbitrary).includes('Private'), false)
  const withBrowser = makePhoneReport({ result, includeBrowser: true, userAgent: 'Browser identity' })
  assert.equal(withBrowser.browserUserAgent, 'Browser identity')
  assert.equal(makePhoneReport({ result: { ...result, status: 'failed' } }).localTest.response, null)
})

test('copy report handles denied or missing clipboard access and copies only the requested report', async () => {
  const text = JSON.stringify(makePhoneReport({ configuredModel: 'Test model' }))
  let written
  assert.equal(await copyPhoneReport(text, { writeText: async value => { written = value } }), true)
  assert.equal(written, text)
  assert.equal(await copyPhoneReport(text, {}), false)
  assert.equal(await copyPhoneReport(text, { writeText: async () => { throw new Error('Permission denied') } }), false)
})
