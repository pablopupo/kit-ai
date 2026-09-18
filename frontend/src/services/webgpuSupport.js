export function hasWebGPU() {
  return typeof navigator !== 'undefined' && typeof navigator.gpu?.requestAdapter === 'function'
}

/**
 * Checks WebGPU in Worker context (where WebLLM runs). Fails fast before model download.
 * Returns { supported: boolean, error?: string }
 */
export async function checkWebGPUInWorker() {
  if (!hasWebGPU()) {
    return { supported: false, error: 'WebGPU API not found' }
  }
  return new Promise((resolve) => {
    const worker = new Worker(
      new URL('../worker/webgpu-check-worker.js', import.meta.url),
      { type: 'module' }
    )
    const timeout = setTimeout(() => {
      worker.terminate()
      resolve({ supported: false, error: 'WebGPU check timed out' })
    }, 5000)
    worker.onmessage = (e) => {
      clearTimeout(timeout)
      worker.terminate()
      resolve(e.data)
    }
    worker.onerror = (err) => {
      clearTimeout(timeout)
      worker.terminate()
      resolve({ supported: false, error: err?.message || 'Worker error' })
    }
  })
}
