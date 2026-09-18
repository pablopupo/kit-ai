import test from 'node:test'
import assert from 'node:assert/strict'
import { OFFLINE_PROTOCOL } from './offlineCachePolicy.js'

async function fixture(t, { registrationFails = false } = {}) {
  const savedGlobals = Object.fromEntries(['navigator', 'window', 'document', 'isSecureContext'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const messages = []
  const scriptURLs = []
  const sw = new EventTarget()
  const registration = new EventTarget()
  const worker = new EventTarget()
  let complete = true, runtime = false, savesBlocked = false
  let registrations = 0, unregistrations = 0
  worker.state = 'activated'
  worker.postMessage = (message, ports) => {
    messages.push(message.type)
    if (message.type === 'KIT_CANCEL_SAVE' || (message.type === 'KIT_SAVE_RUNTIME' && savesBlocked)) return
    if (message.type === 'KIT_SAVE_RUNTIME') runtime = true
    ports?.[0]?.postMessage({ protocol: OFFLINE_PROTOCOL, appSaved: complete, runtimeSaved: runtime })
  }
  registration.active = worker
  registration.unregister = async () => { unregistrations++; return true }
  sw.register = async url => {
    scriptURLs.push(url)
    registrations++
    if (registrationFails) throw new Error('Offline registration denied')
    sw.controller = worker
    complete = true
    return registration
  }
  sw.getRegistration = async () => registration
  const nav = { serviceWorker: sw, onLine: true }
  const doc = new EventTarget()
  doc.visibilityState = 'visible'
  for (const [key, value] of Object.entries({ navigator: nav, document: doc, window: new EventTarget(), isSecureContext: true })) Object.defineProperty(globalThis, key, { configurable: true, value })
  t.after(() => {
    for (const [key, descriptor] of Object.entries(savedGlobals)) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]
  })
  const service = await import(`./offlineAppService.js?test=${Math.random()}`)
  return { service, messages, scriptURLs, nav, counts: () => ({ registrations, unregistrations }), removeCachedFile: () => { complete = false }, blockRuntimeSave: () => { savesBlocked = true } }
}

test('registration failure becomes an actionable failure, never an offline-ready claim', async t => {
  const { service } = await fixture(t, { registrationFails: true })
  await service.retryOfflineSave()
  assert.equal(service.getOfflineAppSnapshot().status, 'error')
})

test('a missing saved page is detected and repair reinstalls instead of mixing HTML revisions', async t => {
  const f = await fixture(t)
  await f.service.retryOfflineSave()
  assert.equal(f.service.getOfflineAppSnapshot().status, 'ready')
  f.removeCachedFile()
  await f.service.checkOfflineApp()
  assert.equal(f.service.getOfflineAppSnapshot().status, 'error')
  await f.service.retryOfflineSave()
  assert.deepEqual(f.counts(), { registrations: 2, unregistrations: 0 })
  assert.equal(f.scriptURLs[0], '/sw.js')
  assert.match(f.scriptURLs[1], /^\/sw.js\?restore=\d+$/)
  assert.equal(f.messages.includes('KIT_REPAIR_APP'), false)
  assert.equal(f.service.getOfflineAppSnapshot().status, 'ready')
})

test('pause rejects a pending assistant download promptly and tells the worker to cancel', async t => {
  const f = await fixture(t)
  await f.service.retryOfflineSave()
  f.blockRuntimeSave()
  const controller = new AbortController()
  const pending = f.service.ensureOfflineRuntime(controller.signal)
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  assert.ok(f.messages.includes('KIT_CANCEL_SAVE'))
  assert.equal(f.service.getOfflineAppSnapshot().runtimeSaved, false)
  assert.equal(f.service.getOfflineAppSnapshot().status, 'ready')
})
