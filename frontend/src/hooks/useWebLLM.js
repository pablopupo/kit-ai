import { useState, useCallback, useRef, useEffect } from 'react'
import { buildMessages } from '../services/chatPrompt'
import { checkWebGPUInWorker } from '../services/webgpuSupport'
import { shouldDeferDownload } from '../services/offlinePolicy'
import { useSettings } from '../contexts/SettingsContext'
import { useOfflineApp } from './useOfflineApp'
import { checkOfflineApp, ensureOfflineRuntime, getOfflineAppSnapshot, retryOfflineSave } from '../services/offlineAppService'

export function useWebLLM() {
  const { autoPrepare, setAutoPrepare, downloadAllowed, setDownloadAllowed, language } = useSettings()
  const [status, setStatus] = useState('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)
  const [modelSaved, setModelSaved] = useState(false)
  const offlineApp = useOfflineApp()
  const forceOnce = useRef(false)
  const downloadAllowedRef = useRef(downloadAllowed)
  downloadAllowedRef.current = downloadAllowed
  const operation = useRef(null)
  const resumeQueued = useRef(false)
  const statusRef = useRef('idle')
  const updateStatus = useCallback(value => { statusRef.current = value; setStatus(value) }, [])

  const loadEngine = useCallback(async (force = false) => {
    if (operation.current) return
    if (statusRef.current === 'ready' && getOfflineAppSnapshot().runtimeSaved && !force) return
    if (getOfflineAppSnapshot().status !== 'ready') return
    const controller = new AbortController()
    operation.current = controller
    updateStatus('checking')
    setError(null)
    try {
      const support = await checkWebGPUInWorker()
      if (controller.signal.aborted) return
      if (!support.supported) { updateStatus('unsupported'); return }
      if (!downloadAllowedRef.current) { updateStatus('consent'); return }
      if (!force && !forceOnce.current && shouldDeferDownload(navigator.connection, getOfflineAppSnapshot().runtimeSaved)) { updateStatus('limited'); return }
      // The page and guides must reopen before spending data on the assistant.
      await ensureOfflineRuntime(controller.signal)
      const service = await import('../services/webllmService')
      if (controller.signal.aborted) return
      const cached = await service.isModelCached().catch(() => false)
      if (controller.signal.aborted) return
      if (!cached && !navigator.onLine) { updateStatus('waiting'); return }
      if (!force && !forceOnce.current && shouldDeferDownload(navigator.connection, cached)) { updateStatus('limited'); return }
      forceOnce.current = false
      updateStatus(cached ? 'loading' : 'downloading')
      setProgress(0)
      await service.initEngine(undefined, report => {
        if (!controller.signal.aborted) setProgress(report.progress ?? 0)
      }, controller.signal)
      if (controller.signal.aborted) return
      const [saved] = await Promise.all([service.isModelCached().catch(() => false), checkOfflineApp()])
      if (controller.signal.aborted) return
      setModelSaved(saved)
      updateStatus('ready')
      // Best effort: browser permission/eviction policy still controls durability.
      navigator.storage?.persist?.().catch(() => {})
    } catch (err) {
      if (controller.signal.aborted || err.name === 'AbortError') return
      setError(err)
      updateStatus(navigator.onLine ? 'error' : 'waiting')
    } finally {
      if (operation.current === controller) {
        operation.current = null
        if (resumeQueued.current) {
          resumeQueued.current = false
          queueMicrotask(() => loadEngine(true))
        }
      }
    }
  }, [updateStatus])

  useEffect(() => {
    if (autoPrepare && offlineApp.status === 'ready') loadEngine()
    const reconnect = () => {
      if (autoPrepare && ['idle', 'waiting', 'error', 'limited'].includes(statusRef.current)) loadEngine()
    }
    window.addEventListener('online', reconnect)
    navigator.connection?.addEventListener('change', reconnect)
    return () => {
      window.removeEventListener('online', reconnect)
      navigator.connection?.removeEventListener('change', reconnect)
    }
  }, [autoPrepare, downloadAllowed, loadEngine, offlineApp.status, offlineApp.runtimeSaved])

  const pause = useCallback(() => {
    resumeQueued.current = false
    setAutoPrepare(false)
    operation.current?.abort()
    updateStatus(statusRef.current === 'ready' ? 'ready' : 'paused')
  }, [setAutoPrepare, updateStatus])
  const resume = useCallback(async () => {
    downloadAllowedRef.current = true
    setDownloadAllowed(true)
    setAutoPrepare(true)
    forceOnce.current = true
    if (getOfflineAppSnapshot().status !== 'ready') await retryOfflineSave()
    if (operation.current) resumeQueued.current = true
    else loadEngine(true)
  }, [loadEngine, setAutoPrepare, setDownloadAllowed])

  const sendMessage = useCallback(async (content, history, onStream, signal) => {
    if (statusRef.current !== 'ready') throw new Error('The device assistant is not ready.')
    // Input validation must not invalidate a healthy device engine.
    const messages = buildMessages(content, history, { language })
    const { generateReply } = await import('../services/webllmService')
    if (signal?.aborted) throw new DOMException('Stopped', 'AbortError')
    try {
      return await generateReply(messages, { signal, onStream, language })
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err)
        updateStatus('error')
      }
      throw err
    }
  }, [language, updateStatus])

  const offlineSaved = offlineApp.status === 'ready' && offlineApp.runtimeSaved && modelSaved && status === 'ready'
  return { status, progress, error, loadEngine, pause, resume, sendMessage, offlineApp, offlineSaved, retryOfflineSave, needsDownloadConsent: !downloadAllowed && status !== 'unsupported' }
}
