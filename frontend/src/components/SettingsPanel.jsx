import { ArrowUpRight, ChevronDown } from 'lucide-react'
import { useSettings, SUPPORTED_LANGUAGES } from '../contexts/SettingsContext'
import { useTTS } from '../contexts/TTSContext'
import OfflineSetup from './OfflineSetup'
import { phoneCheckTitle } from './PhoneCheck'

const panelClass = 'rounded-3xl border border-teal-100/70 dark:border-slate-700 bg-[#F2FAF8] dark:bg-kit-dark-bg-light p-5 sm:p-6'

export default function SettingsPanel({ local, onCheckDevice }) {
  const { t, language, setLanguage, darkMode, setDarkMode, autoPrepare, allowOnline, setAllowOnline } = useSettings()
  const { ttsEnabled, setTtsEnabled, speed, setSpeed } = useTTS()
  return <section className="max-w-xl">
    <h1 className="text-3xl font-display font-bold mb-7">{t('settingsTitle')}</h1>
    <div className="space-y-3">
      <label className={`block ${panelClass}`}><span className="block font-bold">{t('language')}</span><span className="block text-sm text-slate-600 dark:text-slate-400 mt-1 mb-3">{t('languageDetail')}</span><span className="relative block"><select value={language} onChange={e => setLanguage(e.target.value)} className="appearance-none w-full min-h-12 rounded-2xl border border-teal-200 dark:border-slate-600 pl-4 pr-12 bg-white dark:bg-kit-dark-bg text-base">{SUPPORTED_LANGUAGES.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</select><ChevronDown aria-hidden="true" size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-teal-800 dark:text-teal-300" /></span></label>
      <Toggle title={t('darkMode')} description={t('darkModeDesc')} checked={darkMode} onChange={setDarkMode} />
      <Toggle title={t('readAloud')} description={t('readAloudDetail')} checked={ttsEnabled} onChange={setTtsEnabled} />
      <label className={`block ${panelClass}`}><span className="font-bold">{t('voiceSpeed')}: {speed}×</span><input aria-label={t('voiceSpeed')} type="range" min="0.5" max="2" step="0.1" value={speed} onChange={e => setSpeed(Number(e.target.value))} className="block w-full min-h-11 mt-2 accent-teal-700" /></label>
      <div className={panelClass}><h2 className="font-bold mb-3">{t('offlineSettings')}</h2><OfflineSetup local={local} /><p className="text-sm text-slate-600 dark:text-slate-400">{t('storageDetail')}</p></div>
      <div className="px-2 py-1"><button onClick={onCheckDevice} className="kit-text-button">{phoneCheckTitle(language)} <ArrowUpRight size={16} /></button></div>
      {!local.needsDownloadConsent && <Toggle title={t('autoSetup')} description={t('autoSetupDetail')} checked={autoPrepare} onChange={value => value ? local.resume() : local.pause()} />}
      <Toggle title={t('onlineHelp')} description={t('onlineHelpDetail')} checked={allowOnline} onChange={setAllowOnline} />
      <details className={`${panelClass} text-sm`}><summary className="font-bold cursor-pointer min-h-11 content-center">{t('privacy')}</summary><p className="mt-2 leading-relaxed text-slate-600 dark:text-slate-300">{t('privacyDetail')}</p></details>
      <div className={panelClass}><h2 className="font-bold mb-2">{t('takeWithYou')}</h2><p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{t('installDetail')}</p></div>
      <div className={panelClass}><h2 className="font-bold mb-2">{t('aboutGuides')}</h2><p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{t('aboutDetail')}</p></div>
    </div>
  </section>
}
function Toggle({ title, description, checked, onChange }) {
  return <label className={`flex gap-4 items-center justify-between cursor-pointer ${panelClass}`}><span className="min-w-0"><span className="block font-bold">{title}</span><span className="block mt-1 text-sm text-slate-600 dark:text-slate-400">{description}</span></span><span className="relative flex items-center shrink-0 w-12 min-h-11"><input type="checkbox" className="peer absolute inset-0 z-10 w-full h-full opacity-0 cursor-pointer" checked={checked} onChange={e => onChange(e.target.checked)} /><span aria-hidden="true" className="w-12 h-7 rounded-full bg-slate-300 dark:bg-slate-600 peer-checked:bg-[#17695f] peer-focus-visible:ring-2 peer-focus-visible:ring-teal-700 peer-focus-visible:ring-offset-4 transition-colors" /><span aria-hidden="true" className="absolute left-1 h-5 w-5 rounded-full bg-white shadow-sm peer-checked:translate-x-5 transition-transform" /></span></label>
}
