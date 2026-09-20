import {
  CreateWebWorkerMLCEngine,
  prebuiltAppConfig,
  hasModelInCache,
} from '@mlc-ai/web-llm'
import { LOCAL_MODEL_ID } from './localModelConfig'
import { MAX_RESPONSE_TOKENS } from './chatPrompt'
import { devLog, devWarn } from '../utils/devLog'
import { engineProgress } from './engineProgress.js'

const CUSTOM_MODEL_URL = import.meta.env.VITE_WEBLLM_MODEL_URL
const CUSTOM_MODEL_ID = import.meta.env.VITE_WEBLLM_MODEL_ID || 'kit-ai-medical-v1'
const CUSTOM_MODEL_LIB = import.meta.env.VITE_WEBLLM_MODEL_LIB

const customModelRecord = CUSTOM_MODEL_URL
  ? {
      model: CUSTOM_MODEL_URL,
      model_id: CUSTOM_MODEL_ID,
      model_lib: CUSTOM_MODEL_LIB,
      overrides: { context_window_size: 4096 },
    }
  : null

const DEFAULT_MODEL = LOCAL_MODEL_ID
const appConfig = { ...prebuiltAppConfig, useIndexedDBCache: true, model_list: customModelRecord ? [...prebuiltAppConfig.model_list, customModelRecord] : prebuiltAppConfig.model_list }

function configFor(record) {
  return record ? { ...appConfig, model_list: [...appConfig.model_list.filter(item => item.model_id !== record.model_id), record] } : appConfig
}

export function isModelCached(modelId = DEFAULT_MODEL, record) { return hasModelInCache(modelId, configFor(record)) }

let engine = null
let activeModelId = null
let worker = null
let initPromise = null // Guards against concurrent init calls (e.g. StrictMode)

export async function initEngine(modelId = DEFAULT_MODEL, onProgress, signal, record) {
  if (signal?.aborted) throw new DOMException('Paused', 'AbortError')
  if (CUSTOM_MODEL_URL && !CUSTOM_MODEL_LIB) {
    throw new Error('A custom local model needs MLC-format weights and a matching VITE_WEBLLM_MODEL_LIB. A bitsandbytes Hugging Face repository cannot run in WebLLM.')
  }
  devLog('[WebLLM] initEngine called', { modelId, hasExistingEngine: !!engine })

  // If already initialized, return the existing engine
  if (engine) {
    if (activeModelId !== modelId) throw new Error('Unload the current assistant before selecting another model.')
    devLog('[WebLLM] Engine already exists, returning existing engine')
    return engine
  }

  // If init is already in progress, return the same promise to avoid duplicates
  if (initPromise) {
    if (activeModelId !== modelId) throw new Error('Another assistant is still loading.')
    devLog('[WebLLM] Init already in progress, waiting for existing promise')
    return initPromise
  }

  activeModelId = modelId
  initPromise = (async () => {
    devLog('[WebLLM] Creating new worker...')
    worker = new Worker(
      new URL('../worker/webllm-worker.js', import.meta.url),
      { type: 'module' }
    )
    const initializingWorker = worker
    let workerFailed
    const failure = new Promise((_, reject) => {
      workerFailed = event => {
        event?.preventDefault?.()
        reject(new Error('The assistant stopped while opening.'))
      }
    })
    initializingWorker.addEventListener('error', workerFailed)
    initializingWorker.addEventListener('messageerror', workerFailed)

    const engineConfig = {
      appConfig: configFor(record),
      initProgressCallback: (report) => {
        if (onProgress && report) {
          onProgress(engineProgress(report))
        }
      },
      logLevel: 'WARN',
    }

    let abort
    const cancelled = new Promise((_, reject) => {
      abort = () => reject(new DOMException('Paused', 'AbortError'))
      signal?.addEventListener('abort', abort, { once: true })
    })
    devLog('[WebLLM] Creating engine...')
    try {
      // Prefill size comes from compiled WASM metadata; a JS override is ignored.
      engine = await Promise.race([CreateWebWorkerMLCEngine(worker, modelId, engineConfig, { context_window_size: 4096 }), cancelled, failure])
      devLog('[WebLLM] Engine created successfully!', { hasEngine: !!engine })
      return engine
    } catch (error) {
      // Clean up on failure so a retry can start fresh
      engine = null
      activeModelId = null
      if (worker) {
        worker.terminate()
        worker = null
      }
      if (error.name !== 'AbortError') console.error('[WebLLM] Failed to create engine:', error)
      throw error
    } finally {
      initializingWorker.removeEventListener('error', workerFailed)
      initializingWorker.removeEventListener('messageerror', workerFailed)
      signal?.removeEventListener('abort', abort)
      initPromise = null
    }
  })()

  return initPromise
}

export async function chat(messages, options = {}) {
  if (!engine) {
    devWarn('WebLLM engine is null, attempting to reinitialize...')
    try {
      await initEngine()
    } catch (initError) {
      console.error('Failed to reinitialize engine:', initError)
      throw new Error('AI model failed to load. Please refresh the page.')
    }
  }

  if (!engine) {
    throw new Error('AI model failed to initialize. Please refresh the page.')
  }

  const { stream = true } = options

  try {
    const chunks = await engine.chat.completions.create({
      messages,
      stream,
      ...options,
    })

    if (stream) {
      return chunks
    }
    return chunks.choices[0]?.message?.content ?? ''
  } catch (error) {
    console.error('Chat error:', error)
    throw error
  }
}

export async function unloadEngine() {
  // If init is in progress, wait for it to finish before unloading
  if (initPromise) {
    try {
      await initPromise
    } catch (_) {
      // Init failed — that's fine, we still clean up below
    }
  }

  if (engine) {
    try {
      await engine.unload()
    } catch (err) {
      devWarn('[WebLLM] Error during engine.unload():', err)
    }
    engine = null
  }
  if (worker) {
    worker.terminate()
    worker = null
  }
  activeModelId = null
}

// A failed worker may never acknowledge unload(). Terminating it is also what
// releases its pending requests and GPU resources before a subsequent retry.
export function invalidateEngine() {
  const failedWorker = worker
  engine = null
  activeModelId = null
  worker = null
  failedWorker?.terminate()
}

export async function collectResponse(chunks, { signal, onStream, language = 'en', onInterrupt } = {}) {
  let response = ''
  let finishReason
  let drainInterrupted = false
  for await (const chunk of chunks) {
    if (signal?.aborted) {
      // WebLLM's worker releases its generation lock only after the final chunk
      // is consumed. Returning/throwing here would strand the next request.
      if (!drainInterrupted) { onInterrupt?.(); drainInterrupted = true }
      continue
    }
    response += chunk.choices[0]?.delta?.content ?? ''
    finishReason = chunk.choices[0]?.finish_reason ?? finishReason
    onStream?.(response)
  }
  if (signal?.aborted) throw new DOMException('Stopped', 'AbortError')
  if (!response.trim()) throw new Error('The model returned no answer.')
  if (finishReason === 'length') {
    response += language === 'es'
      ? '\n\nEsta respuesta alcanzó su límite de longitud y puede estar incompleta. Consulta la guía enlazada o pide los pasos restantes.'
      : '\n\nThis response reached its length limit and may be incomplete. Check the linked guide or ask for the remaining steps.'
    onStream?.(response)
  }
  return response
}

export async function generateReply(messages, { signal, onStream, language = 'en', expectedModelId } = {}) {
  if (signal?.aborted) throw new DOMException('Stopped', 'AbortError')
  // Trials must fail visibly, never auto-reinitialize the production default.
  if (expectedModelId && (!engine || activeModelId !== expectedModelId)) throw new Error('The selected assistant is not loaded.')
  const stop = () => interruptGeneration()
  signal?.addEventListener('abort', stop, { once: true })
  try {
    const chunks = await chat(messages, { stream: true, max_tokens: MAX_RESPONSE_TOKENS, temperature: 0.2 })
    return await collectResponse(chunks, { signal, onStream, language, onInterrupt: stop })
  } catch (error) {
    if (error?.name !== 'AbortError') invalidateEngine()
    throw error
  } finally {
    signal?.removeEventListener('abort', stop)
  }
}

export { hasWebGPU, checkWebGPUInWorker } from './webgpuSupport'

export function interruptGeneration() { engine?.interruptGenerate() }
