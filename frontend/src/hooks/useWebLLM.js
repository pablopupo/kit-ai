import { useState, useCallback, useRef } from 'react'
import { buildMessages } from '../services/chatPrompt'

export function useWebLLM() {
  const [status, setStatus] = useState('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)
  const loading = useRef(false)

  // Loading is a user action. Browsing a guide never downloads model weights.
  const loadEngine = useCallback(async () => {
    if (loading.current) return
    loading.current = true
    setStatus('loading')
    setError(null)
    try {
      const service = await import('../services/webllmService')
      const result = await service.checkWebGPUInWorker()
      if (!result.supported) throw new Error('This device cannot run local AI. You can still read every first-aid guide or use the online medical model.')
      await service.initEngine(undefined, report => setProgress(report.progress ?? 0))
      setStatus('ready')
    } catch (err) {
      setError(err)
      setStatus('error')
    } finally {
      loading.current = false
    }
  }, [])

  const sendMessage = useCallback(async (content, history, onStream, signal) => {
    if (status !== 'ready') throw new Error('Download local AI first.')
    const { chat, interruptGeneration } = await import('../services/webllmService')
    if (signal?.aborted) throw new DOMException('Stopped', 'AbortError')
    const stop = () => interruptGeneration()
    signal?.addEventListener('abort', stop, { once: true })
    try {
      const chunks = await chat(buildMessages(content, history), { stream: true, max_tokens: 640, temperature: 0.2 })
      let response = ''
      for await (const chunk of chunks) {
        if (signal?.aborted) throw new DOMException('Stopped', 'AbortError')
        response += chunk.choices[0]?.delta?.content ?? ''
        onStream?.(response)
      }
      if (signal?.aborted) throw new DOMException('Stopped', 'AbortError')
      if (!response.trim()) throw new Error('The model returned no answer. Try a shorter question or open a first-aid guide.')
      return response
    } finally {
      signal?.removeEventListener('abort', stop)
    }
  }, [status])

  return { status, progress, error, loadEngine, sendMessage }
}
