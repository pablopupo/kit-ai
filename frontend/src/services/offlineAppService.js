import { savedAppStatus } from './offlineCachePolicy.js'
import { inspectOfflineSupport, offlineFailureReason } from './offlineSupport.js'

let snapshot = { status: 'checking', runtimeSaved: false, reason: null, support: null }
const listeners = new Set()
let started = false
let registration
let registering
let checkSequence = 0
let installTimer
const watched = new WeakSet()
const watchedContainers = new WeakSet()
const publish = value => { snapshot = { ...snapshot, ...value }; listeners.forEach(listener => listener()) }
const online = () => { try { return globalThis.navigator?.onLine !== false } catch { return false } }
export const getOfflineAppSnapshot = () => snapshot
export const subscribeOfflineApp = listener => { listeners.add(listener); return () => listeners.delete(listener) }

function workerContainer() {
  const { support, reason, serviceWorker } = inspectOfflineSupport()
  publish({ support })
  if (reason) {
    clearTimeout(installTimer)
    publish({ status: 'unsupported', runtimeSaved: false, reason })
    return null
  }
  return serviceWorker
}

function watchContainer(serviceWorker) {
  if (!serviceWorker || watchedContainers.has(serviceWorker)) return
  serviceWorker.addEventListener('controllerchange', () => checkOfflineApp())
  watchedContainers.add(serviceWorker)
}

function askWorker(type, timeoutMs = 8000, signal) {
  const worker = workerContainer()?.controller
  if (!worker) return Promise.reject(new Error('App is not saved yet'))
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel()
    const requestId = `${Date.now()}-${Math.random()}`
    let settled = false
    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      channel.port1.close()
      channel.port2.close()
      error ? reject(error) : resolve(value)
    }
    const cancel = () => { try { worker.postMessage({ type: 'KIT_CANCEL_SAVE', requestId }) } catch { /* Worker may have gone away. */ } }
    const abort = () => { cancel(); finish(new DOMException('Paused', 'AbortError')) }
    const timer = setTimeout(() => { cancel(); finish(new DOMException('Save check timed out', 'TimeoutError')) }, timeoutMs)
    if (signal?.aborted) { abort(); return }
    signal?.addEventListener('abort', abort, { once: true })
    channel.port1.onmessage = event => finish(null, event.data)
    channel.port1.onmessageerror = () => finish(new Error('Save check failed'))
    try { worker.postMessage({ type, requestId }, [channel.port2]) } catch (error) { finish(error) }
  })
}

export async function checkOfflineApp() {
  const sequence = ++checkSequence
  const serviceWorker = workerContainer()
  if (!serviceWorker) return snapshot
  try {
    if (!serviceWorker.controller) return snapshot
    const result = await askWorker('KIT_OFFLINE_STATUS')
    if (sequence !== checkSequence) return snapshot
    const status = savedAppStatus(result, Boolean(serviceWorker.controller))
    publish({ status, runtimeSaved: result.runtimeSaved === true, reason: status === 'ready' ? null : result.failed ? 'save-check-failed' : 'app-files-missing' })
    if (status === 'ready') clearTimeout(installTimer)
  } catch (error) {
    if (sequence === checkSequence && snapshot.status !== 'unsupported') publish({
      status: registration?.installing ? 'saving' : online() ? 'error' : 'waiting', runtimeSaved: false,
      reason: offlineFailureReason(error, error?.name === 'TimeoutError' ? 'save-check-timeout' : 'save-check-failed'),
    })
  }
  return snapshot
}

function watchWorker(worker) {
  if (!worker || watched.has(worker)) return
  watched.add(worker)
  const update = () => {
    if (worker.state === 'activated') checkOfflineApp()
    if (worker.state === 'redundant') {
      const serviceWorker = workerContainer()
      if (!serviceWorker) return
      try {
        if (serviceWorker.controller) checkOfflineApp()
        else publish({ status: online() ? 'error' : 'waiting', runtimeSaved: false, reason: 'install-failed' })
      } catch { publish({ status: online() ? 'error' : 'waiting', runtimeSaved: false, reason: 'save-check-failed' }) }
    }
  }
  worker.addEventListener('statechange', update)
  update()
}

async function registerApp(repair = false) {
  if (registering) return registering
  const serviceWorker = workerContainer()
  if (!serviceWorker) return snapshot
  publish({ status: online() ? 'saving' : 'waiting', reason: null })
  clearTimeout(installTimer)
  // A failed install must not leave people looking at an endless saving state.
  installTimer = setTimeout(() => {
    if (snapshot.status !== 'ready') publish({ status: online() ? 'error' : 'waiting', runtimeSaved: false, reason: 'save-timeout' })
  }, 45000)
  registering = Promise.resolve().then(async () => {
    try {
      watchContainer(serviceWorker)
      // A repair must run install again even when the script bytes are unchanged.
      // Unregistering/re-registering the same URL can resurrect the active worker
      // in an open tab, leaving missing cache entries untouched.
      const url = repair ? `/sw.js?restore=${Date.now()}` : '/sw.js'
      registration = await serviceWorker.register(url, { scope: '/', updateViaCache: 'none' })
      registration.addEventListener('updatefound', () => watchWorker(registration.installing))
      watchWorker(registration.installing)
      watchWorker(registration.waiting)
      watchWorker(registration.active)
      await checkOfflineApp()
    } catch (error) {
      clearTimeout(installTimer)
      // A registration/update failure need not invalidate an already-saved app.
      const reason = offlineFailureReason(error, 'registration-failed')
      let controlled = false
      try { controlled = Boolean(serviceWorker.controller) } catch { /* Access can be blocked separately from registration. */ }
      if (controlled) await checkOfflineApp()
      else publish({ status: online() ? 'error' : 'waiting', runtimeSaved: false, reason })
    } finally { registering = null }
    return snapshot
  })
  return registering
}

export function startOfflineApp() {
  if (started || typeof window === 'undefined') return
  started = true
  // The registration path safely checks feature getters before attaching hooks.
  window.addEventListener('online', () => retryOfflineSave())
  window.addEventListener('offline', () => checkOfflineApp())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkOfflineApp()
  })
  registerApp()
}

export async function retryOfflineSave() {
  if (registration?.installing || registering) return snapshot
  const serviceWorker = workerContainer()
  if (!serviceWorker) return snapshot
  try {
    if (serviceWorker.controller) {
      publish({ status: online() ? 'saving' : 'waiting', reason: null })
      await checkOfflineApp()
      if (snapshot.status === 'ready' || snapshot.status === 'unsupported') return snapshot
      if (!online()) return snapshot
      // Install a fresh current manifest atomically; never mix new HTML with an
      // old worker's revision keys. Keep model and conversation data intact.
      const previous = await serviceWorker.getRegistration()
      if (previous?.installing) { watchWorker(previous.installing); return snapshot }
      return await registerApp(true)
    }
    return await registerApp()
  } catch (error) {
    publish({ status: online() ? 'error' : 'waiting', runtimeSaved: false, reason: offlineFailureReason(error, 'save-check-failed') })
    return snapshot
  }
}

export async function ensureOfflineRuntime(signal) {
  if (signal?.aborted) throw new DOMException('Paused', 'AbortError')
  if (snapshot.status !== 'ready') throw new Error('Finish saving the app first')
  try {
    const result = await askWorker('KIT_SAVE_RUNTIME', 180000, signal)
    if (signal?.aborted) throw new DOMException('Paused', 'AbortError')
    if (savedAppStatus(result, Boolean(workerContainer()?.controller)) !== 'ready' || !result.runtimeSaved) throw new Error('Assistant files could not be saved')
    publish({ runtimeSaved: true, reason: null })
  } catch (error) {
    if (error?.name !== 'AbortError' && snapshot.status !== 'unsupported') publish({ runtimeSaved: false, reason: offlineFailureReason(error, 'runtime-save-failed') })
    throw error
  }
}
