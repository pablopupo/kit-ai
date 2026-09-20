import { assessModelTrialSupport, modelTrialReason } from './modelTrialSupport.js'

const read = getter => { try { return getter() } catch { return undefined } }

/** No model/runtime imports or large downloads: just a short worker GPU probe. */
export function checkMedicalModelGPUInWorker({
  timeoutMs = 10000,
  workerFactory = () => new Worker(new URL('../worker/model-trial-check-worker.js', import.meta.url), { type: 'module' }),
} = {}) {
  return new Promise(resolve => {
    let worker
    let timer
    let finished = false
    const finish = result => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      try { worker?.terminate() } catch { /* Already stopped. */ }
      resolve(result)
    }
    try {
      worker = workerFactory()
      timer = setTimeout(() => finish({ supported: false, reason: 'worker-timeout' }), timeoutMs)
      worker.onmessage = event => {
        const result = event?.data
        finish(result && typeof result === 'object' ? result : { supported: false, reason: 'invalid-check-result' })
      }
      worker.onerror = () => finish({ supported: false, reason: 'worker-error' })
      worker.onmessageerror = () => finish({ supported: false, reason: 'worker-error' })
    } catch {
      finish({ supported: false, reason: 'worker-unavailable' })
    }
  })
}

async function bestEffortEstimate(nav, timeoutMs) {
  let timer
  try {
    return await Promise.race([
      Promise.resolve().then(() => nav?.storage?.estimate?.()),
      new Promise(resolve => { timer = setTimeout(() => resolve(undefined), timeoutMs) }),
    ])
  } catch { return undefined }
  finally { clearTimeout(timer) }
}

/** Passing means eligible to attempt loading, never that phone memory is proven. */
export async function checkMedicalModelTrial(options = {}) {
  const nav = read(() => 'nav' in options ? options.nav : globalThis.navigator)
  const timeoutMs = options.timeoutMs ?? 10000
  const checkGPU = options.checkGPU || (() => checkMedicalModelGPUInWorker({ timeoutMs }))
  const [gpu, estimate] = await Promise.all([
    Promise.resolve().then(checkGPU).catch(() => ({ supported: false, reason: modelTrialReason('worker-error') })),
    bestEffortEstimate(nav, timeoutMs),
  ])
  return assessModelTrialSupport({ gpu, estimate, modelCached: options.modelCached === true })
}
