import { useRef, useState } from 'react'
import { Download, CheckCircle2, Pause } from 'lucide-react'
import { useSettings } from '../contexts/SettingsContext'

export default function OfflineSetup({ local, compact = false, onSupport }) {
  const { t, autoPrepare } = useSettings()
  const [copyState, setCopyState] = useState('')
  const helpRef = useRef(null)
  const appStatus = local.offlineApp?.status || 'checking'
  // This identifies only the help text; actual feature checks determine support.
  const googleAppWindow = /\bGSA\//.test(navigator.userAgent)
  const website = 'https://kit-ai-pablopupo.vercel.app/'
  const copyLink = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(website)
      setCopyState('appLinkCopied')
    } catch {
      setCopyState('appLinkCopyFailed')
      if (helpRef.current) helpRef.current.open = true
    }
  }
  if (appStatus !== 'ready') {
    const failed = ['error', 'unsupported', 'waiting'].includes(appStatus)
    const title = { error: 'appSaveFailed', unsupported: googleAppWindow ? 'appGoogleWindowTitle' : 'appUnsupported', waiting: 'appWaiting' }[appStatus] || 'appSaving'
    const detail = { unsupported: googleAppWindow ? 'appGoogleWindowDetail' : 'appUnsupportedDetail', error: 'appSaveFailedDetail', waiting: 'appWaitingDetail' }[appStatus] || 'appSaveDetail'
    return <section aria-label={t('offlineSettings')} className="mb-5 rounded-2xl bg-slate-50 dark:bg-slate-800 p-4">
      <p role="status" className="text-sm font-bold">{t(title)}</p>
      <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{t(detail)}</p>
      {appStatus === 'unsupported' && googleAppWindow && <><button onClick={copyLink} className="kit-primary mt-3 text-sm">{t('appCopyLink')}</button>{copyState && <p role="status" className="mt-2 text-sm">{t(copyState)}</p>}</>}
      {failed && <button onClick={local.retryOfflineSave} className="kit-text-button mt-2 text-sm">{t(appStatus === 'unsupported' ? 'appCheckAgain' : 'appRetry')}</button>}
      {appStatus === 'unsupported' && <details ref={helpRef} className="mt-2 text-sm">
        <summary className="min-h-11 content-center font-bold cursor-pointer text-teal-800 dark:text-teal-200">{t('appSavingHelp')}</summary>
        <p className="mt-2 leading-relaxed">{t(local.offlineApp?.reason === 'insecure-context' ? 'appSecureDetail' : 'appOpenBrowserDetail')}</p>
        <p className="mt-3 leading-relaxed">{t('appHomeScreenDetail')}</p>
        <p className="mt-3 leading-relaxed">{t('appSeparateDownload')}</p>
        <label className="block mt-4 font-bold">{t('appWebsite')}<input readOnly value={website} onFocus={event => event.target.select()} className="block w-full min-h-11 mt-2 px-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-kit-dark-bg font-normal text-base" /></label>
        {!googleAppWindow && <button onClick={copyLink} className="kit-text-button mt-2">{t('appCopyLink')}</button>}
        {!googleAppWindow && copyState && <p role="status" className="mt-1 text-sm">{t(copyState)}</p>}
        {onSupport && <button onClick={onSupport} className="kit-text-button mt-2">{t('appCheckBrowser')}</button>}
      </details>}
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
