import { Download, CheckCircle2, Pause } from 'lucide-react'
import { useSettings } from '../contexts/SettingsContext'

export default function OfflineSetup({ local, compact = false }) {
  const { t, autoPrepare } = useSettings()
  const status = local.status === 'idle' && !autoPrepare ? 'paused' : local.status
  const active = ['idle', 'checking', 'downloading', 'loading'].includes(status)
  const title = {
    idle: 'checking', checking: 'checking', downloading: 'downloading', loading: 'loadingSaved',
    ready: 'readyOffline', waiting: 'waitingConnection', limited: 'limitedConnection',
    unsupported: 'unsupported', error: 'setupFailed', paused: 'paused',
  }[status]
  const detail = { ready: 'readyDetail', unsupported: 'unsupportedDetail', limited: 'limitedConnectionDetail', error: 'setupFailedDetail' }[status] || 'setupDetail'
  const value = Math.max(0, Math.min(100, Math.round(local.progress)))
  return (
    <section aria-label={t('offlineSettings')} className={`rounded-xl border border-teal-100 dark:border-slate-700 ${compact ? 'p-4' : 'p-5'} mb-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="font-bold text-sm flex items-center gap-2">{status === 'ready' ? <CheckCircle2 size={18} className="text-teal-700" /> : <Download size={18} className="shrink-0 text-teal-700" />}{t(title, { progress: value })}</p>
        {active && <button onClick={local.pause} className="kit-text-button text-sm"><Pause size={15} />{t('pause')}</button>}
        {['paused', 'limited', 'error', 'waiting'].includes(status) && <button onClick={local.resume} className="kit-text-button text-sm">{t(status === 'limited' ? 'downloadNow' : status === 'error' ? 'retry' : 'resume')}</button>}
      </div>
      {(!compact || status !== 'ready') && <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{t(detail)}</p>}
      {status === 'downloading' && <progress aria-label={t('downloadProgress')} max="100" value={value} className="w-full mt-3 accent-teal-700" />}
    </section>
  )
}
