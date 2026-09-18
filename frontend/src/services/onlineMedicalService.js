import { buildMessages } from './chatPrompt'

export const MEDICAL_MODEL = 'Pablo305/llama3-medical-3b-4bit'
export const MEDICAL_SPACE = import.meta.env.VITE_MEDICAL_SPACE || 'Pablo305/offline-medical-assistant'

export async function askMedicalModel(question, history, { signal, onStatus } = {}) {
  if (!navigator.onLine) throw new Error('Online AI needs an internet connection. First-aid guides remain available offline.')
  let client
  let job
  let finished = false
  let timer
  let abort
  const work = async () => {
    const { Client } = await import('@gradio/client')
    client = await Client.connect(MEDICAL_SPACE, { events: ['data', 'status'] })
    if (finished || signal?.aborted) { client.close(); throw new DOMException('Stopped', 'AbortError') }
    const messages = buildMessages(question, history)
    const prompt = messages.map(m => `${m.role === 'system' ? 'Reference instructions' : m.role}:\n${m.content}`).join('\n\n')
    job = client.submit('/ask', [prompt, 8, 512])
    let result = ''
    for await (const event of job) {
      if (finished || signal?.aborted) throw new DOMException('Stopped', 'AbortError')
      if (event.type === 'status') {
        if (event.stage === 'error') throw new Error('The medical model could not complete this request. Its Hugging Face Space may be starting or out of GPU quota. Try again later, or open a first-aid guide.')
        onStatus?.(event.stage === 'pending' ? 'Waiting for the medical model…' : 'The medical model is responding…')
      }
      if (event.type === 'data' && typeof event.data?.[0] === 'string') result = event.data[0]
    }
    if (!result.trim()) throw new Error('The medical model returned no answer. Open a first-aid guide or try again later.')
    return result.trim()
  }
  const cancelled = new Promise((_, reject) => {
    abort = () => reject(new DOMException('Stopped', 'AbortError'))
    if (signal?.aborted) abort()
    else signal?.addEventListener('abort', abort, { once: true })
    timer = setTimeout(() => reject(new Error('The medical model took too long. First-aid guides are available immediately; try AI again later.')), 90000)
  })
  try {
    return await Promise.race([work(), cancelled])
  } finally {
    finished = true
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
    // Gradio cancellation can perform network requests without a timeout.
    // It must never prevent the UI from displaying an answer or stopping.
    try { job?.cancel()?.catch(() => {}) } catch { /* Best effort. */ }
    client?.close()
  }
}
