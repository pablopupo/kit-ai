import { useCallback, useEffect, useRef, useState } from 'react'
import { useSettings } from '../contexts/SettingsContext'
import { useOfflineApp } from './useOfflineApp'
import { buildMessages } from '../services/chatPrompt'
import { checkMedicalModelTrial } from '../services/modelTrialCheck'
import { MEDICAL_TRIAL_RECORD, MEDICAL_TRIAL_MODEL_ID, MEDICAL_TRIAL_CONSENT_KEY, MEDICAL_TRIAL_DOWNLOAD_GB } from '../services/medicalTrialConfig'
import { checkOfflineApp, ensureOfflineRuntime, getOfflineAppSnapshot, retryOfflineSave } from '../services/offlineAppService'
import { readBoolean, writePreference } from '../utils/preferences'
import { beginAssistantRun, finishAssistantRun, markAssistantRunInterrupted, readAssistantRun } from '../services/assistantRunGuard.js'

const PAUSE_KEY = `${MEDICAL_TRIAL_CONSENT_KEY}:paused`
const ACTIVE_RUN_KEY = `${MEDICAL_TRIAL_CONSENT_KEY}:active-run`

function untilStopped(task, signal) {
  let abort
  const stopped = new Promise((_, reject) => {
    abort = () => reject(new DOMException('Stopped', 'AbortError'))
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
  })
  return Promise.race([task, stopped]).finally(() => signal.removeEventListener('abort', abort))
}

/** One local assistant. A saved trial approval and its artifacts work here too. */
export function useOfflineAssistant() {
  const { language } = useSettings()
  const offlineApp = useOfflineApp()
  const [previousRun] = useState(() => readAssistantRun(ACTIVE_RUN_KEY))
  const [status, setStatus] = useState(() => !MEDICAL_TRIAL_RECORD ? 'unavailable' : previousRun ? 'interrupted' : readBoolean(PAUSE_KEY, false) ? 'paused' : 'checking')
  const [progress, setProgress] = useState(null)
  const [preparationStage, setPreparationStage] = useState('preparing')
  const [lastActivityAt, setLastActivityAt] = useState(null)
  const [startupGuardSaved, setStartupGuardSaved] = useState(null)
  const [check, setCheck] = useState(null)
  const [saved, setSaved] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [lastFailureStage, setLastFailureStage] = useState(previousRun?.stage || null)
  const operation = useRef(null)
  const generation = useRef(null)
  const mounted = useRef(false)
  const approved = useRef(readBoolean(MEDICAL_TRIAL_CONSENT_KEY, false))
  const paused = useRef(readBoolean(PAUSE_KEY, false))
  const started = useRef(false)
  const resumeQueued = useRef(false)
  const repairPending = useRef(false)
  const statusRef = useRef(status)
  const failureStage = useRef(previousRun?.stage || null)
  const recoveryBlocked = useRef(Boolean(previousRun))
  const owner = useRef(`run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`)
  const change = useCallback(value => {
    statusRef.current = value
    if (mounted.current) setStatus(value)
  }, [])
  const failAt = useCallback(stage => {
    failureStage.current = stage
    if (mounted.current) setLastFailureStage(stage)
  }, [])

  const load = useCallback(async (consent = false, repair = false) => {
    if (!mounted.current || recoveryBlocked.current || !MEDICAL_TRIAL_RECORD || generation.current || (statusRef.current === 'ready' && !repair)) return
    if (repair) repairPending.current = true
    if (operation.current) {
      if (operation.current.signal.aborted) resumeQueued.current = true
      return
    }
    const current = new AbortController()
    operation.current = current
    const isCurrent = () => mounted.current && !current.signal.aborted
    let stage = 'compatibility'
    try {
      failAt(null)
      setProgress(null)
      setPreparationStage('preparing')
      setLastActivityAt(Date.now())
      change('checking')
      // No SDK or model import before the device check and explicit approval.
      // Existing approval skips only the provisional free-space check; the
      // actual cache is checked before loading and never proves readiness.
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
      report = await untilStopped(checkMedicalModelTrial({ modelCached: cached }), current.signal)
      if (!isCurrent()) return
      setCheck(report)
      if (!report.supported) { change('unsupported'); return }
      if (!cached && !navigator.onLine) { failAt('model-download'); change('waiting'); return }
      // A working engine can outlive evicted model files. Explicit repair must
      // reload those missing files; cached weights keep the existing engine.
      // Never disrupt an answer in progress or load a different default model.
      if (repairPending.current && !cached) service.invalidateEngine()
      stage = cached ? 'model-loading' : 'model-download'
      change(cached ? 'loading' : 'downloading')
      setPreparationStage(cached ? 'opening' : 'preparing')
      setStartupGuardSaved(beginAssistantRun(ACTIVE_RUN_KEY, owner.current, stage))
      await service.initEngine(MEDICAL_TRIAL_MODEL_ID, value => {
        if (!isCurrent()) return
        const next = cached ? 'opening' : ['preparing', 'downloading', 'opening'].includes(value.preparationStage) ? value.preparationStage : 'preparing'
        setPreparationStage(next)
        setProgress(next === 'downloading' && Number.isFinite(value.progress) && value.progress > 0 && value.progress < 100 ? value.progress : null)
        setLastActivityAt(Date.now())
        if (next === 'opening' && stage !== 'model-loading') {
          stage = 'model-loading'
          beginAssistantRun(ACTIVE_RUN_KEY, owner.current, stage)
          change('loading')
        }
      }, current.signal, MEDICAL_TRIAL_RECORD)
      if (!isCurrent()) return
      const modelCached = await untilStopped(service.isModelCached(MEDICAL_TRIAL_MODEL_ID, MEDICAL_TRIAL_RECORD).catch(() => false), current.signal)
      await untilStopped(checkOfflineApp(), current.signal)
      if (!isCurrent()) return
      setSaved(modelCached)
      if (modelCached) repairPending.current = false
      failAt(null)
      change('ready')
      try { navigator.storage?.persist?.().catch(() => {}) } catch { /* Best effort; browsers still control eviction. */ }
    } catch (error) {
      if (!isCurrent() || error.name === 'AbortError') return
      setSaved(false)
      failAt(stage)
      change(stage === 'model-loading' || navigator.onLine ? 'error' : 'waiting')
    } finally {
      finishAssistantRun(ACTIVE_RUN_KEY, owner.current)
      if (operation.current === current) {
        operation.current = null
        const resume = resumeQueued.current
        resumeQueued.current = false
        if (resume && mounted.current && !paused.current && !recoveryBlocked.current && !['generation', 'model-loading'].includes(failureStage.current) && !['ready', 'unsupported', 'consent', 'interrupted'].includes(statusRef.current)) {
          queueMicrotask(() => { if (mounted.current && !paused.current) load(false) })
        }
      }
    }
  }, [change, failAt])

  useEffect(() => {
    mounted.current = true
    // Deferring avoids starting an abandoned download in StrictMode's first
    // setup/cleanup cycle. A later unmount aborts both loading and generation.
    queueMicrotask(() => {
      if (mounted.current && !started.current) {
        started.current = true
        if (recoveryBlocked.current) markAssistantRunInterrupted(ACTIVE_RUN_KEY, previousRun?.owner)
        else if (!paused.current) load(false)
      }
    })
    return () => {
      mounted.current = false
      resumeQueued.current = false
      operation.current?.abort()
      generation.current?.abort()
    }
  }, [load])

  useEffect(() => {
    const reconnect = () => {
      if (!approved.current || paused.current || recoveryBlocked.current || ['ready', 'unsupported', 'consent', 'unavailable', 'interrupted'].includes(statusRef.current)) return
      if (['generation', 'model-loading'].includes(failureStage.current)) return
      if (operation.current) resumeQueued.current = true
      else load(false)
    }
    window.addEventListener('online', reconnect)
    return () => window.removeEventListener('online', reconnect)
  }, [load])

  useEffect(() => {
    // An app update can still be installing when preparation first runs.
    // Resume once its files are saved, without another download approval.
    if (offlineApp.status === 'ready' && failureStage.current === 'app-saving' && approved.current && !paused.current) {
      if (operation.current) resumeQueued.current = true
      else load(false)
    }
  }, [offlineApp.status, lastFailureStage, load])

  const acknowledgeInterruption = useCallback(() => {
    if (!recoveryBlocked.current) return
    finishAssistantRun(ACTIVE_RUN_KEY, previousRun?.owner)
    recoveryBlocked.current = false
  }, [previousRun])
  const prepare = useCallback(() => {
    acknowledgeInterruption()
    paused.current = false
    writePreference(PAUSE_KEY, 'false')
    return load(true)
  }, [load, acknowledgeInterruption])
  const resume = useCallback(() => {
    acknowledgeInterruption()
    paused.current = false
    writePreference(PAUSE_KEY, 'false')
    return load(false)
  }, [load, acknowledgeInterruption])
  const retry = useCallback(() => {
    acknowledgeInterruption()
    paused.current = false
    writePreference(PAUSE_KEY, 'false')
    return load(false, true)
  }, [load, acknowledgeInterruption])
  const pause = useCallback(() => {
    if (statusRef.current === 'ready') return
    paused.current = true
    writePreference(PAUSE_KEY, 'true')
    resumeQueued.current = false
    operation.current?.abort()
    // Pausing does not revoke the user's one-time permission or discard files.
    // Reconnecting will not restart a deliberately paused download.
    change('paused')
  }, [change])
  const sendMessage = useCallback(async (content, history, onStream, signal) => {
    if (!mounted.current || statusRef.current !== 'ready') throw new Error('Assistant not ready')
    if (generation.current) throw new Error('An answer is already in progress')
    if (signal?.aborted) throw new DOMException('Stopped', 'AbortError')
    // Invalid input must not invalidate a healthy engine.
    const messages = buildMessages(content, history, { language })
    const current = new AbortController()
    generation.current = current
    setIsGenerating(true)
    const stop = () => current.abort()
    signal?.addEventListener('abort', stop, { once: true })
    setStartupGuardSaved(beginAssistantRun(ACTIVE_RUN_KEY, owner.current, 'generation'))
    try {
      const service = await import('../services/webllmService')
      if (current.signal.aborted) throw new DOMException('Stopped', 'AbortError')
      // This guard prevents a failed engine from silently loading stock 1B.
      return await service.generateReply(messages, {
        signal: current.signal,
        onStream: value => { if (mounted.current && !current.signal.aborted) onStream?.(value) },
        language,
        expectedModelId: MEDICAL_TRIAL_MODEL_ID,
      })
    } catch (error) {
      if (mounted.current && error.name !== 'AbortError') {
        setSaved(false)
        failAt('generation')
        change('error')
      }
      throw error
    } finally {
      finishAssistantRun(ACTIVE_RUN_KEY, owner.current)
      signal?.removeEventListener('abort', stop)
      if (generation.current === current) generation.current = null
      if (mounted.current) setIsGenerating(false)
    }
  }, [language, change, failAt])

  return {
    status, progress, preparationStage, lastActivityAt, startupGuardSaved, check, prepare, resume, pause, retry, sendMessage, isGenerating, offlineApp,
    offlineSaved: saved && status === 'ready' && offlineApp.status === 'ready' && offlineApp.runtimeSaved,
    modelId: MEDICAL_TRIAL_MODEL_ID, downloadGB: MEDICAL_TRIAL_DOWNLOAD_GB, lastFailureStage,
    needsDownloadConsent: !approved.current,
  }
}
