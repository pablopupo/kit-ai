import { useEffect, useState } from 'react'
import { Download, LoaderCircle, Pause } from 'lucide-react'
import { useSettings } from '../contexts/SettingsContext'
import { simpleChatCopy } from '../utils/simpleChatCopy'

export default function AssistantSetup({ local, online, onDismiss, onHelp }) {
  const { language } = useSettings()
  const c = simpleChatCopy[language] || simpleChatCopy.en
  const status = local.status
  const active = ['checking', 'saving', 'loading', 'downloading'].includes(status)
  const stage = local.preparationStage || (status === 'loading' ? 'opening' : status === 'downloading' ? 'downloading' : 'preparing')
  const [takingLonger, setTakingLonger] = useState(false)
  useEffect(() => {
    setTakingLonger(false)
    if (!active) return
    const timer = setTimeout(() => setTakingLonger(true), 20000)
    return () => clearTimeout(timer)
  }, [active, stage, status])

  if (local.offlineSaved) return null
  // Preparation and opening have no measured completion percentage. In
  // particular, the SDK's initial zero is not download progress.
  const measuredDownload = active && stage === 'downloading' && Number.isFinite(local.progress) && local.progress > 0 && local.progress < 100
  const progress = measuredDownload ? Math.floor(local.progress) : null
  const downloadTitle = measuredDownload
    ? progress === 0 ? c.downloadStarted : c.downloading.replace('{progress}', progress)
    : c.downloadStarting
  const consent = status === 'consent'
  const interrupted = status === 'interrupted'
  const openingFailed = status === 'error' && local.lastFailureStage === 'model-loading'
  const generationFailed = status === 'error' && local.lastFailureStage === 'generation'
  const needsConnection = !online && !openingFailed && !generationFailed && ['consent', 'waiting', 'error', 'unavailable'].includes(status)
  const title = interrupted ? c.interrupted : generationFailed ? c.reopen : openingFailed ? c.openFailed : needsConnection ? c.waiting : active ? (
    stage === 'opening' ? c.loading : stage === 'downloading' ? downloadTitle : status === 'saving' ? c.saving : c.checking
  ) : ({
    consent: c.setupTitle, paused: c.paused, waiting: c.waiting,
    unsupported: c.unsupported, error: c.failed, unavailable: c.failed, ready: c.saveIncomplete,
  }[status] || c.checking)
  const detail = interrupted ? c.interruptedDetail : generationFailed ? c.reopenDetail : openingFailed ? c.openFailedDetail : needsConnection ? c.waitingDetail : active ? (
    stage === 'opening' ? c.loadingDetail : stage === 'downloading' ? c.downloadDetail : status === 'saving' ? c.savingDetail : c.checkingDetail
  ) : ({
    consent: c.setupDetail, paused: c.pausedDetail, waiting: c.waitingDetail,
    unsupported: c.unsupportedDetail, error: c.failedDetail, unavailable: c.failedDetail, ready: c.saveIncompleteDetail,
  }[status] || c.checkingDetail)
  const canRetry = interrupted || openingFailed || generationFailed || (online && ['error', 'waiting', 'ready'].includes(status))
  const canDismiss = (consent || interrupted) && online && onDismiss
  return <section aria-label={c.setupLabel} className="mb-6 rounded-[1.75rem] border border-[#D5EBE5] bg-[#F1FAF7] p-5 sm:p-6 dark:border-slate-600 dark:bg-kit-dark-bg-light">
    <div className="flex items-center gap-3">
      {active && <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#DDF2EB] text-[#17695F] dark:bg-teal-900 dark:text-teal-200"><LoaderCircle size={21} className="animate-spin motion-reduce:animate-none" /></span>}
      <h2 role="status" aria-live="polite" aria-atomic="true" className="text-lg font-extrabold text-[#225F56] dark:text-teal-200">{title}</h2>
    </div>
    <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{detail}</p>
    {measuredDownload && <progress aria-label={c.downloadProgress} max="100" value={local.progress} className="mt-4 block h-2 w-full accent-[#17695F]" />}
    {active && takingLonger && <p role="status" className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{stage === 'opening' ? c.openingTakesTime : c.preparingTakesTime}</p>}
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
      {consent && online && <button onClick={() => local.prepare()} className="kit-primary text-sm"><Download size={17} aria-hidden="true" />{c.download.replace('{size}', local.downloadGB)}</button>}
      {active && <button onClick={local.pause} className="kit-text-button text-sm"><Pause size={16} aria-hidden="true" />{c.pause}</button>}
      {status === 'paused' && <button onClick={local.resume} className="kit-primary text-sm">{stage === 'opening' ? c.resumeOpening : c.resume}</button>}
      {canRetry && <button onClick={local.retry} className="kit-primary text-sm">{interrupted || openingFailed || generationFailed ? c.tryOpening : c.retry}</button>}
      {['unsupported', 'error', 'unavailable', 'interrupted'].includes(status) && <button onClick={onHelp} className="kit-text-button text-sm">{c.openSettings}</button>}
      {canDismiss && <button onClick={onDismiss} className="kit-text-button text-sm">{c.notNow}</button>}
    </div>
  </section>
}
