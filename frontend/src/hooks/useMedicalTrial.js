import { useCallback, useEffect, useRef, useState } from 'react'
import { useSettings } from '../contexts/SettingsContext'
import { useOfflineApp } from './useOfflineApp'
import { buildMessages } from '../services/chatPrompt'
import { checkMedicalModelTrial } from '../services/modelTrialCheck'
import { MEDICAL_TRIAL_RECORD, MEDICAL_TRIAL_MODEL_ID, MEDICAL_TRIAL_CONSENT_KEY, MEDICAL_TRIAL_DOWNLOAD_GB } from '../services/medicalTrialConfig'
import { checkOfflineApp, ensureOfflineRuntime, getOfflineAppSnapshot, retryOfflineSave } from '../services/offlineAppService'
import { readBoolean, writePreference } from '../utils/preferences'

function untilStopped(task, signal) {
  let abort
  const stopped = new Promise((_, reject) => {
    abort = () => reject(new DOMException('Stopped', 'AbortError'))
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
  })
  return Promise.race([task, stopped]).finally(() => signal.removeEventListener('abort', abort))
}

export function useMedicalTrial() {
  const { language } = useSettings()
  const offlineApp = useOfflineApp()
  const [status, setStatus] = useState(MEDICAL_TRIAL_RECORD ? 'checking' : 'unavailable')
  const [progress, setProgress] = useState(0)
  const [check, setCheck] = useState(null)
  const [saved, setSaved] = useState(false)
  const [lastFailureStage, setLastFailureStage] = useState(null)
  const operation = useRef(null)
  const mounted = useRef(false)
  const approved = useRef(readBoolean(MEDICAL_TRIAL_CONSENT_KEY, false))
  const started = useRef(false)
  const resumeQueued = useRef(false)
  const statusRef = useRef(status)
  const change = useCallback(value => {
    statusRef.current = value
    if (mounted.current) setStatus(value)
  }, [])

  const prepare = useCallback(async (consent = true) => {
    if (!MEDICAL_TRIAL_RECORD || statusRef.current === 'ready') return
    if (operation.current) {
      if (operation.current.signal.aborted && consent) resumeQueued.current = true
      return
    }
    const current = new AbortController()
    operation.current = current
    const isCurrent = () => mounted.current && !current.signal.aborted
    let stage = 'compatibility'
    try {
      change('checking')
      // This first check has no model imports, requests or writes. A saved
      // approval only skips the provisional quota check; cache is checked below.
      let report = await untilStopped(checkMedicalModelTrial({ modelCached: approved.current }), current.signal)
      if (!isCurrent()) return
      setCheck(report)
      if (!report.supported) { change('unsupported'); return }
      if (!approved.current && !consent) { change('consent'); return }
      if (consent) {
        approved.current = true
        writePreference(MEDICAL_TRIAL_CONSENT_KEY, 'true')
      }
      stage = 'app-saving'
      if (getOfflineAppSnapshot().status !== 'ready') {
        change('saving')
        await untilStopped(retryOfflineSave(), current.signal)
        if (!isCurrent()) return
        if (getOfflineAppSnapshot().status !== 'ready') throw new Error('App not saved')
      }
      stage = 'runtime-saving'
      change('saving')
      await ensureOfflineRuntime(current.signal)
      if (!isCurrent()) return
      const service = await import('../services/webllmService')
      if (!isCurrent()) return
      const cached = await untilStopped(service.isModelCached(MEDICAL_TRIAL_MODEL_ID, MEDICAL_TRIAL_RECORD).catch(() => false), current.signal)
      if (!isCurrent()) return
      stage = 'storage'
      // Cache metadata alone is not an offline-ready claim. Successful loading
      // and an actual offline reopening are still needed.
      report = await untilStopped(checkMedicalModelTrial({ modelCached: cached }), current.signal)
      if (!isCurrent()) return
      setCheck(report)
      if (!report.supported) { change('unsupported'); return }
      if (!cached && !navigator.onLine) { change('waiting'); return }
      stage = cached ? 'model-loading' : 'model-download'
      change(cached ? 'loading' : 'downloading')
      setProgress(0)
      await service.initEngine(MEDICAL_TRIAL_MODEL_ID, value => {
        if (isCurrent()) setProgress(value.progress ?? 0)
      }, current.signal, MEDICAL_TRIAL_RECORD)
      if (!isCurrent()) return
      const modelCached = await untilStopped(service.isModelCached(MEDICAL_TRIAL_MODEL_ID, MEDICAL_TRIAL_RECORD).catch(() => false), current.signal)
      await untilStopped(checkOfflineApp(), current.signal)
      if (!isCurrent()) return
      setSaved(modelCached)
      setLastFailureStage(null)
      change('ready')
      try { navigator.storage?.persist?.().catch(() => {}) } catch { /* best effort */ }
    } catch (error) {
      if (!isCurrent() || error.name === 'AbortError') return
      setSaved(false)
      setLastFailureStage(stage)
      change(navigator.onLine ? 'error' : 'waiting')
    } finally {
      if (operation.current === current) {
        operation.current = null
        if (resumeQueued.current && mounted.current) {
          resumeQueued.current = false
          queueMicrotask(() => { if (mounted.current) prepare(true) })
        }
      }
    }
  }, [change])

  useEffect(() => {
    mounted.current = true
    // Run after StrictMode's setup/cleanup cycle. Never let a stale check
    // launch a download after unmount.
    queueMicrotask(() => {
      if (mounted.current && !started.current) {
        started.current = true
        prepare(false)
      }
    })
    return () => {
      mounted.current = false
      resumeQueued.current = false
      operation.current?.abort()
    }
  }, [prepare])

  const pause = useCallback(() => {
    resumeQueued.current = false
    operation.current?.abort()
    approved.current = false
    writePreference(MEDICAL_TRIAL_CONSENT_KEY, 'false')
    change('paused')
  }, [change])
  const send = useCallback(async (content, history, onStream, signal) => {
    if (statusRef.current !== 'ready') throw new Error('Assistant not ready')
    const messages = buildMessages(content, history, { language })
    const service = await import('../services/webllmService')
    if (signal?.aborted) throw new DOMException('Stopped', 'AbortError')
    try {
      // No online provider is reachable from this path, even with Wi-Fi on.
      return await service.generateReply(messages, { signal, onStream, language, expectedModelId: MEDICAL_TRIAL_MODEL_ID })
    } catch (error) {
      if (error.name !== 'AbortError') {
        setSaved(false)
        setLastFailureStage('generation')
        change('error')
      }
      throw error
    }
  }, [language, change])
  return {
    status, progress, check, prepare, pause, retry: prepare, send, offlineApp,
    offlineSaved: saved && status === 'ready' && offlineApp.status === 'ready' && offlineApp.runtimeSaved,
    modelId: MEDICAL_TRIAL_MODEL_ID, downloadGB: MEDICAL_TRIAL_DOWNLOAD_GB, lastFailureStage,
  }
}
