import { savedAppStatus } from './offlineCachePolicy.js'

let snapshot = { status: 'checking', runtimeSaved: false }
const listeners = new Set()
let started = false
let registration
let registering
let checkSequence = 0
let installTimer
const watched = new WeakSet()
const publish = value => { snapshot = { ...snapshot, ...value }; listeners.forEach(listener => listener()) }
export const getOfflineAppSnapshot = () => snapshot
export const subscribeOfflineApp = listener => { listeners.add(listener); return () => listeners.delete(listener) }

function askWorker(type, timeoutMs = 8000, signal) {
  const worker = navigator.serviceWorker?.controller
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
    const timer = setTimeout(() => { cancel(); finish(new Error('Save check timed out')) }, timeoutMs)
    if (signal?.aborted) { abort(); return }
    signal?.addEventListener('abort', abort, { once: true })
    channel.port1.onmessage = event => finish(null, event.data)
    channel.port1.onmessageerror = () => finish(new Error('Save check failed'))
    try { worker.postMessage({ type, requestId }, [channel.port2]) } catch (error) { finish(error) }
  })
}

export async function checkOfflineApp() {
  const sequence = ++checkSequence
  if (!navigator.serviceWorker?.controller) return snapshot
  try {
    const result = await askWorker('KIT_OFFLINE_STATUS')
    if (sequence !== checkSequence) return snapshot
    const status = savedAppStatus(result, Boolean(navigator.serviceWorker.controller))
    publish({ status, runtimeSaved: result.runtimeSaved === true })
    if (status === 'ready') clearTimeout(installTimer)
  } catch {
    if (sequence === checkSequence) publish({ status: registration?.installing ? 'saving' : navigator.onLine ? 'error' : 'waiting', runtimeSaved: false })
  }
  return snapshot
}

function watchWorker(worker) {
  if (!worker || watched.has(worker)) return
  watched.add(worker)
  const update = () => {
    if (worker.state === 'activated') checkOfflineApp()
    if (worker.state === 'redundant') {
      if (navigator.serviceWorker.controller) checkOfflineApp()
      else publish({ status: navigator.onLine ? 'error' : 'waiting', runtimeSaved: false })
    }
  }
  worker.addEventListener('statechange', update)
  update()
}

async function registerApp(repair = false) {
  if (registering) return registering
  if (!('serviceWorker' in navigator) || !globalThis.isSecureContext) {
    publish({ status: 'unsupported', runtimeSaved: false })
    return snapshot
  }
  publish({ status: navigator.onLine ? 'saving' : 'waiting' })
  clearTimeout(installTimer)
  // A failed install must not leave people looking at an endless saving state.
  installTimer = setTimeout(() => {
    if (snapshot.status !== 'ready') publish({ status: navigator.onLine ? 'error' : 'waiting', runtimeSaved: false })
  }, 45000)
  registering = (async () => {
    try {
      // A repair must run install again even when the script bytes are unchanged.
      // Unregistering/re-registering the same URL can resurrect the active worker
      // in an open tab, leaving missing cache entries untouched.
      const url = repair ? `/sw.js?restore=${Date.now()}` : '/sw.js'
      registration = await navigator.serviceWorker.register(url, { scope: '/', updateViaCache: 'none' })
      registration.addEventListener('updatefound', () => watchWorker(registration.installing))
      watchWorker(registration.installing)
      watchWorker(registration.waiting)
      watchWorker(registration.active)
      await checkOfflineApp()
    } catch {
      clearTimeout(installTimer)
      if (navigator.serviceWorker.controller) await checkOfflineApp()
      else publish({ status: navigator.onLine ? 'error' : 'waiting', runtimeSaved: false })
    } finally { registering = null }
    return snapshot
  })()
  return registering
}

export function startOfflineApp() {
  if (started || typeof window === 'undefined') return
  started = true
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('controllerchange', () => checkOfflineApp())
  window.addEventListener('online', () => retryOfflineSave())
  window.addEventListener('offline', () => checkOfflineApp())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkOfflineApp()
  })
  registerApp()
}

export async function retryOfflineSave() {
  if (registration?.installing || registering) return snapshot
  try {
    if (navigator.serviceWorker?.controller) {
      publish({ status: navigator.onLine ? 'saving' : 'waiting' })
      await checkOfflineApp()
      if (snapshot.status === 'ready') return snapshot
      if (!navigator.onLine) return snapshot
      // Install a fresh current manifest atomically; never mix new HTML with an
      // old worker's revision keys. Keep model and conversation data intact.
      const previous = await navigator.serviceWorker.getRegistration()
      if (previous?.installing) { watchWorker(previous.installing); return snapshot }
      return await registerApp(true)
    }
    return await registerApp()
  } catch {
    publish({ status: navigator.onLine ? 'error' : 'waiting', runtimeSaved: false })
    return snapshot
  }
}

export async function ensureOfflineRuntime(signal) {
  if (signal?.aborted) throw new DOMException('Paused', 'AbortError')
  if (snapshot.status !== 'ready') throw new Error('Finish saving the app first')
  const result = await askWorker('KIT_SAVE_RUNTIME', 180000, signal)
  if (signal?.aborted) throw new DOMException('Paused', 'AbortError')
  if (savedAppStatus(result, Boolean(navigator.serviceWorker.controller)) !== 'ready' || !result.runtimeSaved) throw new Error('Assistant files could not be saved')
  publish({ runtimeSaved: true })
}
