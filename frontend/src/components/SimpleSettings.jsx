import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useSettings, SUPPORTED_LANGUAGES } from '../contexts/SettingsContext'
import { modelTrialReason } from '../services/modelTrialSupport'
import { offlineReason } from '../services/offlineSupport'

const copy = {
  en: {
    title: 'Settings', language: 'Language', darkMode: 'Dark mode',
    online: 'Use internet when Kit isn’t ready',
    onlineDetail: 'Kit always answers on this device when it is ready.',
    about: 'About & privacy',
    caution: 'Kit is experimental and can make mistakes. It cannot diagnose you. In an emergency, seek urgent help.',
    privacy: 'Questions answered on this device stay here. If internet answers are enabled and Kit isn’t ready, your question and earlier online messages are sent to Hugging Face for an answer.',
    history: 'Conversations are saved in this browser. Avoid sharing names or other personal details.',
    help: 'Help', reportDetail: 'If something goes wrong, you can copy a report to share. It contains app checks, never your conversations. Nothing is sent automatically.',
    report: 'Copy report', copying: 'Copying…', copied: 'Report copied.',
    copyFailed: 'Select and copy the report below.', reportLabel: 'Report to copy',
  },
  es: {
    title: 'Ajustes', language: 'Idioma', darkMode: 'Modo oscuro',
    online: 'Usar internet cuando Kit no esté listo',
    onlineDetail: 'Cuando está listo, Kit siempre responde en este dispositivo.',
    about: 'Acerca de Kit y privacidad',
    caution: 'Kit es experimental y puede equivocarse. No puede darte un diagnóstico. En una emergencia, busca ayuda urgente.',
    privacy: 'Las preguntas que Kit responde en este dispositivo se quedan aquí. Si permites respuestas por internet y Kit no está listo, tu pregunta y los mensajes anteriores enviados por internet se envían a Hugging Face para obtener una respuesta.',
    history: 'Las conversaciones se guardan en este navegador. Evita compartir nombres u otros datos personales.',
    help: 'Ayuda', reportDetail: 'Si algo falla, puedes copiar un informe para compartirlo. Contiene comprobaciones de la aplicación, nunca tus conversaciones. No se envía nada automáticamente.',
    report: 'Copiar informe', copying: 'Copiando…', copied: 'Informe copiado.',
    copyFailed: 'Selecciona y copia el informe de abajo.', reportLabel: 'Informe para copiar',
  },
}

const statuses = ['checking', 'consent', 'paused', 'saving', 'downloading', 'loading', 'waiting', 'error', 'ready', 'unsupported', 'unavailable', 'interrupted']
const failureStages = ['compatibility', 'app-saving', 'runtime-saving', 'storage', 'model-loading', 'model-download', 'generation']
const limitNames = ['maxBufferSize', 'maxStorageBufferBindingSize', 'maxComputeWorkgroupStorageSize', 'maxStorageBuffersPerShaderStage']
const booleanOrNull = value => typeof value === 'boolean' ? value : null
const numberOrNull = value => Number.isFinite(value) && value >= 0 ? value : null
const limitsOnly = limits => Object.fromEntries(limitNames.map(name => [name, numberOrNull(limits?.[name])]))

// Export only named diagnostic fields. Never serialize the hook, exceptions,
// browser identity, storage contents, or conversation objects into a report.
function makeReport(local) {
  return {
    schema: 'kit-ai-help-v1',
    exportedAt: new Date().toISOString(),
    status: statuses.includes(local?.status) ? local.status : null,
    modelId: typeof local?.modelId === 'string' && /^[a-zA-Z0-9._-]{1,180}$/.test(local.modelId) ? local.modelId : null,
    offlineSaved: booleanOrNull(local?.offlineSaved),
    offlineApp: local?.offlineApp ? {
      status: statuses.includes(local.offlineApp.status) ? local.offlineApp.status : null,
      reason: offlineReason(local.offlineApp.reason),
      runtimeSaved: booleanOrNull(local.offlineApp.runtimeSaved),
    } : null,
    check: local?.check ? {
      supported: booleanOrNull(local.check.supported),
      reason: local.check.reason == null ? null : modelTrialReason(local.check.reason),
      shaderF16: booleanOrNull(local.check.features?.shaderF16),
      modelCached: booleanOrNull(local.check.modelCached),
      deviceChecked: booleanOrNull(local.check.deviceChecked),
      limits: limitsOnly(local.check.limits),
      requestedLimits: limitsOnly(local.check.requestedLimits),
    } : null,
    lastFailureStage: failureStages.includes(local?.lastFailureStage) ? local.lastFailureStage : null,
    preparationStage: ['preparing', 'downloading', 'opening'].includes(local?.preparationStage) ? local.preparationStage : null,
    downloadProgress: numberOrNull(local?.progress),
    startupGuardSaved: booleanOrNull(local?.startupGuardSaved),
  }
}

const muted = 'text-sm leading-relaxed text-slate-600 dark:text-slate-300'
const row = 'px-5 py-4 sm:px-6'
const card = 'rounded-3xl bg-[#F1FAF8] dark:bg-kit-dark-bg-light'

export default function SimpleSettings({ local }) {
  const { language, setLanguage, darkMode, setDarkMode, allowOnline, setAllowOnline } = useSettings()
  const c = copy[language] || copy.en
  const [copyStatus, setCopyStatus] = useState('')
  const [reportText, setReportText] = useState('')

  const copyReport = async () => {
    const text = JSON.stringify(makeReport(local), null, 2)
    setCopyStatus('copying')
    setReportText('')
    try {
      await navigator.clipboard.writeText(text)
      setCopyStatus('copied')
    } catch {
      setReportText(text)
      setCopyStatus('copyFailed')
    }
  }

  return <section className="mx-auto w-full max-w-xl pb-8">
    <h1 className="mb-6 text-3xl font-extrabold">{c.title}</h1>
    <div className={`${card} divide-y divide-teal-100 dark:divide-slate-700`}>
      <label className={`${row} flex flex-wrap items-center justify-between gap-3`}>
        <span className="font-bold">{c.language}</span>
        <span className="relative min-w-40">
          <select value={language} onChange={event => setLanguage(event.target.value)} className="min-h-12 w-full appearance-none rounded-2xl border border-[#CFE5E0] bg-white py-2 pl-4 pr-10 text-base dark:border-slate-600 dark:bg-kit-dark-bg">
            {SUPPORTED_LANGUAGES.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}
          </select>
          <ChevronDown aria-hidden="true" size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#17695F] dark:text-teal-200" />
        </span>
      </label>
      <Toggle title={c.darkMode} checked={darkMode} onChange={setDarkMode} />
      <Toggle title={c.online} description={c.onlineDetail} checked={allowOnline} onChange={setAllowOnline} />
    </div>

    <div className="mt-4 space-y-3">
      <details className={`${card} ${row}`}>
        <summary className="min-h-11 cursor-pointer content-center font-bold">{c.about}</summary>
        <div className={`space-y-3 pb-1 pt-2 ${muted}`}>
          <p>{c.caution}</p>
          <p>{c.privacy}</p>
          <p>{c.history}</p>
        </div>
      </details>
      <details className={`${card} ${row}`}>
        <summary className="min-h-11 cursor-pointer content-center font-bold">{c.help}</summary>
        <p className={`mt-2 ${muted}`}>{c.reportDetail}</p>
        <button type="button" onClick={copyReport} disabled={copyStatus === 'copying'} className="mt-3 inline-flex min-h-12 items-center justify-center rounded-full border border-[#CFE5E0] bg-white px-5 py-2 font-bold text-[#17695F] hover:bg-teal-50 disabled:opacity-50 dark:border-slate-600 dark:bg-kit-dark-bg dark:text-teal-200 dark:hover:bg-slate-800">{copyStatus === 'copying' ? c.copying : c.report}</button>
        <p role="status" className={`mt-2 ${muted}`}>{copyStatus && copyStatus !== 'copying' ? c[copyStatus] : ''}</p>
        {reportText && <textarea aria-label={c.reportLabel} readOnly value={reportText} onFocus={event => event.currentTarget.select()} className="mt-2 min-h-48 w-full rounded-2xl border border-[#CFE5E0] bg-white p-3 font-mono text-base dark:border-slate-600 dark:bg-kit-dark-bg" />}
      </details>
    </div>
  </section>
}

function Toggle({ title, description, checked, onChange }) {
  const labelId = useId()
  const descriptionId = useId()
  return <div className={`${row} flex items-center justify-between gap-4`}>
    <div className="min-w-0">
      <p id={labelId} className="font-bold">{title}</p>
      {description && <p id={descriptionId} className={`mt-1 ${muted}`}>{description}</p>}
    </div>
    <button type="button" role="switch" aria-checked={checked} aria-labelledby={labelId} aria-describedby={description ? descriptionId : undefined} onClick={() => onChange(!checked)} className="relative flex min-h-12 w-12 shrink-0 items-center rounded-full">
      <span aria-hidden="true" className={`h-7 w-12 rounded-full transition-colors ${checked ? 'bg-[#17695F]' : 'bg-slate-300 dark:bg-slate-600'}`} />
      <span aria-hidden="true" className={`absolute left-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  </div>
}
