import { Download, CheckCircle2, Pause } from 'lucide-react'
import { useSettings } from '../contexts/SettingsContext'

export default function OfflineSetup({ local, compact = false }) {
  const { t, autoPrepare } = useSettings()
  const appStatus = local.offlineApp?.status || 'checking'
  if (appStatus !== 'ready') {
    const failed = ['error', 'unsupported', 'waiting'].includes(appStatus)
    const title = { error: 'appSaveFailed', unsupported: 'appUnsupported', waiting: 'appWaiting' }[appStatus] || 'appSaving'
    return <section aria-label={t('offlineSettings')} className="mb-5 rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
      <div className="flex items-center justify-between gap-3"><p role="status" className="text-sm font-bold">{t(title)}</p>{failed && appStatus !== 'unsupported' && <button onClick={local.retryOfflineSave} className="kit-text-button text-sm shrink-0">{t('appRetry')}</button>}</div>
      <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{t('appSaveDetail')}</p>
    </section>
  }
  if (local.needsDownloadConsent) return <section aria-label={t('offlineSettings')} className="mb-5 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
    <h2 className="font-bold text-sm">{t('downloadConsentTitle')}</h2>
    <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{t('downloadConsentDetail')}</p>
    <button onClick={local.resume} className="kit-text-button mt-3 text-sm">{t('downloadConsentAction')}</button>
  </section>
  const status = local.status === 'idle' && !autoPrepare ? 'paused' : local.status
  const active = ['idle', 'checking', 'downloading', 'loading'].includes(status)
  const title = {
    idle: 'checking', checking: 'checking', downloading: 'downloading', loading: 'loadingSaved',
    ready: local.offlineSaved ? 'savedReady' : 'readyOffline', waiting: 'waitingConnection', limited: 'limitedConnection',
    unsupported: 'unsupported', error: 'setupFailed', paused: 'paused',
  }[status]
  const detail = { ready: local.offlineSaved ? 'savedReadyDetail' : 'loadedOnlyDetail', unsupported: 'unsupportedDetail', limited: 'limitedConnectionDetail', error: 'setupFailedDetail' }[status] || 'setupDetail'
  const value = Math.max(0, Math.min(100, Math.round(local.progress)))
  return (
    <section aria-label={t('offlineSettings')} className={`rounded-xl border border-teal-100 dark:border-slate-700 ${compact ? 'p-4' : 'p-5'} mb-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="font-bold text-sm flex items-center gap-2">{local.offlineSaved ? <CheckCircle2 size={18} className="text-teal-700" /> : <Download size={18} className="shrink-0 text-teal-700" />}{t(title, { progress: value })}</p>
        {active && <button onClick={local.pause} className="kit-text-button text-sm"><Pause size={15} />{t('pause')}</button>}
        {(['paused', 'limited', 'error', 'waiting'].includes(status) || (status === 'ready' && !local.offlineSaved)) && <button onClick={local.resume} className="kit-text-button text-sm">{t(status === 'limited' ? 'downloadNow' : ['error', 'ready'].includes(status) ? 'retry' : 'resume')}</button>}
      </div>
      {(!compact || status !== 'ready') && <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{t(detail)}</p>}
      {status === 'downloading' && <progress aria-label={t('downloadProgress')} max="100" value={value} className="w-full mt-3 accent-teal-700" />}
    </section>
  )
}
