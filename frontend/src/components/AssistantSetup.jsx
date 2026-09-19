import { Download, Pause } from 'lucide-react'
import { useSettings } from '../contexts/SettingsContext'
import { simpleChatCopy } from '../utils/simpleChatCopy'

export default function AssistantSetup({ local, online, onDismiss, onHelp }) {
  const { language } = useSettings()
  const c = simpleChatCopy[language] || simpleChatCopy.en
  if (local.offlineSaved) return null
  const status = local.status
  const progress = Math.max(0, Math.min(100, Math.round(local.progress || 0)))
  const consent = status === 'consent'
  const needsConnection = !online && ['consent', 'waiting', 'error', 'unavailable'].includes(status)
  const generationFailed = status === 'error' && local.lastFailureStage === 'generation'
  const title = generationFailed ? c.reopen : needsConnection ? c.waiting : ({
    consent: c.setupTitle, checking: c.checking, saving: c.saving, loading: c.loading,
    downloading: c.downloading.replace('{progress}', progress), paused: c.paused,
    waiting: c.waiting, unsupported: c.unsupported, error: c.failed,
    unavailable: c.failed, ready: c.saveIncomplete,
  }[status] || c.checking)
  const detail = generationFailed ? c.reopenDetail : needsConnection ? c.waitingDetail : ({
    consent: c.setupDetail, checking: c.checkingDetail, saving: c.savingDetail, loading: c.loadingDetail,
    downloading: c.downloadDetail, paused: c.pausedDetail, waiting: c.waitingDetail,
    unsupported: c.unsupportedDetail, error: c.failedDetail, unavailable: c.failedDetail, ready: c.saveIncompleteDetail,
  }[status] || c.checkingDetail)
  const active = ['saving', 'loading', 'downloading'].includes(status)
  return <section aria-label={c.setupLabel} className="mb-6 rounded-[1.75rem] border border-[#D5EBE5] bg-[#F1FAF7] p-5 sm:p-6 dark:border-slate-600 dark:bg-kit-dark-bg-light">
    <h2 role="status" className="text-lg font-extrabold text-[#225F56] dark:text-teal-200">{title}</h2>
    <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{detail}</p>
    {status === 'downloading' && <progress aria-label={title} max="100" value={progress} className="mt-4 block h-2 w-full accent-[#17695F]" />}
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
      {consent && online && <button onClick={() => local.prepare()} className="kit-primary text-sm"><Download size={17} aria-hidden="true" />{c.download.replace('{size}', local.downloadGB)}</button>}
      {active && <button onClick={local.pause} className="kit-text-button text-sm"><Pause size={16} aria-hidden="true" />{c.pause}</button>}
      {status === 'paused' && <button onClick={local.resume} className="kit-primary text-sm">{c.resume}</button>}
      {['error', 'waiting', 'ready'].includes(status) && (online || generationFailed) && <button onClick={local.retry} className="kit-primary text-sm">{c.retry}</button>}
      {['unsupported', 'error', 'unavailable'].includes(status) && <button onClick={onHelp} className="kit-text-button text-sm">{c.openSettings}</button>}
      {consent && online && onDismiss && <button onClick={onDismiss} className="kit-text-button text-sm">{c.notNow}</button>}
    </div>
  </section>
}
