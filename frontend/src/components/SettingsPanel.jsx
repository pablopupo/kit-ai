import { ArrowUpRight } from 'lucide-react'
import { useSettings, SUPPORTED_LANGUAGES } from '../contexts/SettingsContext'
import { useTTS } from '../contexts/TTSContext'
import OfflineSetup from './OfflineSetup'

export default function SettingsPanel({ local }) {
  const { t, language, setLanguage, darkMode, setDarkMode, autoPrepare, allowOnline, setAllowOnline } = useSettings()
  const { ttsEnabled, setTtsEnabled, speed, setSpeed } = useTTS()
  return <section className="max-w-xl">
    <h1 className="text-3xl font-extrabold mb-8">{t('settingsTitle')}</h1>
    <div className="divide-y divide-slate-200 dark:divide-slate-700">
      <label className="block pb-5"><span className="block font-bold">{t('language')}</span><span className="block text-sm text-slate-500 mt-1 mb-3">{t('languageDetail')}</span><select value={language} onChange={e => setLanguage(e.target.value)} className="w-full min-h-12 rounded-xl border border-slate-300 dark:border-slate-600 px-3 bg-white dark:bg-kit-dark-bg-light text-base">{SUPPORTED_LANGUAGES.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
      <Toggle title={t('darkMode')} description={t('darkModeDesc')} checked={darkMode} onChange={setDarkMode} />
      <Toggle title={t('readAloud')} description={t('readAloudDetail')} checked={ttsEnabled} onChange={setTtsEnabled} />
      <label className="block py-5"><span className="font-bold">{t('voiceSpeed')}: {speed}×</span><input aria-label={t('voiceSpeed')} type="range" min="0.5" max="2" step="0.1" value={speed} onChange={e => setSpeed(Number(e.target.value))} className="block w-full mt-4 accent-teal-700" /></label>
      <div className="pt-5"><h2 className="font-bold mb-3">{t('offlineSettings')}</h2><OfflineSetup local={local} /><p className="text-sm text-slate-500 mb-4">{t('storageDetail')}</p></div>
      <Toggle title={t('autoSetup')} description={t('autoSetupDetail')} checked={autoPrepare} onChange={value => value ? local.resume() : local.pause()} />
      <Toggle title={t('onlineHelp')} description={t('onlineHelpDetail')} checked={allowOnline} onChange={setAllowOnline} />
      <div className="py-5"><h2 className="font-bold mb-2">{t('takeWithYou')}</h2><p className="text-sm text-slate-600 dark:text-slate-300">{t('installDetail')}</p></div>
      <div className="py-5"><h2 className="font-bold mb-2">{t('aboutGuides')}</h2><p className="text-sm text-slate-600 dark:text-slate-300">{t('aboutDetail')}</p><a href="https://github.com/pablopupo/kit-ai" target="_blank" rel="noreferrer" className="kit-text-button mt-4">{t('viewProject')} <ArrowUpRight size={16} /></a></div>
      <details className="py-5 text-sm"><summary className="font-bold cursor-pointer min-h-11 flex items-center">{t('modelDetails')}</summary><p className="leading-relaxed text-slate-500">{t('modelDetailText')}</p></details>
    </div>
  </section>
}
function Toggle({ title, description, checked, onChange }) {
  return <label className="flex gap-4 items-center justify-between py-5"><span><span className="block font-bold">{title}</span><span className="text-sm text-slate-500">{description}</span></span><input type="checkbox" className="shrink-0 w-6 h-6 accent-teal-700" checked={checked} onChange={e => onChange(e.target.checked)} /></label>
}
