import { memo, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Download, Pause, RefreshCw } from 'lucide-react'
import { useSettings } from '../contexts/SettingsContext'
import { useMedicalTrial } from '../hooks/useMedicalTrial'
import { copyPhoneReport, makePhoneReport } from '../services/phoneCheckService'
import { getPromptGuideSources } from '../services/chatPrompt'
import ChatInput from './ChatInput'
import KitLogo from './KitLogo'

const copy = {
  en: {
    back: 'Back to Kit', language: 'Language', title: 'Try Kit on this phone',
    intro: 'This is a learning trial of the assistant you trained. Its answers can be wrong. Use made-up examples, not a real medical need.',
    privacy: 'Questions stay on this phone. This trial conversation disappears when you leave or refresh.',
    checking: 'Checking this phone…', unavailable: 'This trial is not available yet',
    unavailableDetail: 'The download is still being prepared. You can return to Kit in the meantime.',
    unsupported: 'This phone cannot run this trial yet', unsupportedDetail: 'You can still use Kit with internet and read your saved guides.',
    consent: 'Save the trial to this phone', consentDetail: 'This is a large download: about {size} GB. Use Wi-Fi and keep this page open until saving finishes.',
    consentNote: 'It is separate from the answers you may have saved in Kit already.', download: 'Download trial · {size} GB',
    paused: 'The download is paused', pausedDetail: 'You can continue when you have Wi-Fi and time to keep Kit open.', resume: 'Continue download',
    saving: 'Saving this page…', downloading: 'Saving the trial…', loading: 'Getting ready to answer…',
    waiting: 'Connect to the internet to continue', waitingDetail: 'Keep this page open while the trial finishes saving.',
    error: 'Kit could not finish getting ready', errorDetail: 'Reconnect to Wi-Fi and try again. If it happens again, copy the report under Help.', retry: 'Try again', pause: 'Pause',
    ready: 'Ready to try an answer', saved: 'Saved for answers without internet',
    saveWait: 'Wait for “Saved for answers without internet” before turning off internet.',
    offlineSteps: 'To test it: turn on airplane mode, turn Wi-Fi off, then reopen this same trial address in this browser. Ask a new question below.',
    samples: 'Start with a made-up example', cut: 'How do I care for a small cut?', burn: 'Can I put butter on a small burn?',
    placeholder: 'Ask a sample question or a follow-up…', preparing: 'Kit is writing…', stop: 'Stop answer', stopping: 'Stopping…',
    stopped: 'The answer was stopped. You can try another question.', failed: 'Kit could not finish the answer. Your question is still here. Try again when Kit is ready.', empty: 'Kit did not return an answer. Try another question.',
    shorten: 'Shorten this question so Kit has room for its first-aid references. Your question is still above.',
    followup: 'You can ask a follow-up below.', answered: 'Kit answered on this phone.', answeredOffline: 'Kit answered with no internet connection detected.',
    help: 'Help', reportDetail: 'The report contains phone checks and answer timings. It does not include your questions or answers. Nothing is sent automatically.',
    report: 'Copy report', copied: 'Report copied.', copyFailed: 'Select and copy the report below.', reportText: 'Report to copy',
    reportCaveat: 'These checks do not prove airplane mode or check whether health advice is correct.',
    seconds: 'seconds',
  },
  es: {
    back: 'Volver a Kit', language: 'Idioma', title: 'Prueba Kit en este teléfono',
    intro: 'Esta prueba nos ayuda a evaluar el asistente que entrenaste. Sus respuestas pueden ser incorrectas. Usa ejemplos inventados, no una necesidad médica real.',
    privacy: 'Las preguntas se quedan en este teléfono. Esta conversación de prueba desaparece al salir o recargar.',
    checking: 'Comprobando este teléfono…', unavailable: 'Esta prueba aún no está disponible',
    unavailableDetail: 'La descarga todavía se está preparando. Mientras tanto, puedes volver a Kit.',
    unsupported: 'Este teléfono aún no puede ejecutar esta prueba', unsupportedDetail: 'Puedes seguir usando Kit con internet y leer las guías guardadas.',
    consent: 'Guarda la prueba en este teléfono', consentDetail: 'Es una descarga grande: unos {size} GB. Usa Wi-Fi y mantén esta página abierta hasta que termine de guardarse.',
    consentNote: 'Es independiente de las respuestas que ya hayas guardado en Kit.', download: 'Descargar prueba · {size} GB',
    paused: 'La descarga está en pausa', pausedDetail: 'Puedes continuar cuando tengas Wi-Fi y tiempo para mantener Kit abierto.', resume: 'Continuar descarga',
    saving: 'Guardando esta página…', downloading: 'Guardando la prueba…', loading: 'Preparando las respuestas…',
    waiting: 'Conéctate a internet para continuar', waitingDetail: 'Mantén esta página abierta mientras termina de guardarse la prueba.',
    error: 'Kit no pudo terminar de prepararse', errorDetail: 'Vuelve a conectarte al Wi-Fi e inténtalo otra vez. Si vuelve a pasar, copia el informe en Ayuda.', retry: 'Volver a intentar', pause: 'Pausar',
    ready: 'Todo listo para probar una respuesta', saved: 'Guardado para responder sin internet',
    saveWait: 'Espera a que aparezca «Guardado para responder sin internet» antes de desactivar internet.',
    offlineSteps: 'Para comprobarlo: activa el modo avión, desactiva el Wi-Fi y vuelve a abrir esta misma dirección de prueba en este navegador. Haz una pregunta nueva abajo.',
    samples: 'Empieza con un ejemplo inventado', cut: '¿Cómo cuido un corte pequeño?', burn: '¿Puedo poner mantequilla en una quemadura pequeña?',
    placeholder: 'Haz una pregunta de ejemplo o de seguimiento…', preparing: 'Kit está escribiendo…', stop: 'Detener respuesta', stopping: 'Deteniendo…',
    stopped: 'Se ha detenido la respuesta. Puedes probar otra pregunta.', failed: 'Kit no pudo terminar la respuesta. Tu pregunta sigue aquí. Inténtalo de nuevo cuando Kit esté listo.', empty: 'Kit no dio una respuesta. Prueba otra pregunta.',
    shorten: 'Acorta la pregunta para que Kit tenga espacio para sus referencias de primeros auxilios. Tu pregunta sigue arriba.',
    followup: 'Puedes hacer una pregunta de seguimiento abajo.', answered: 'Kit respondió en este teléfono.', answeredOffline: 'Kit respondió sin detectar conexión a internet.',
    help: 'Ayuda', reportDetail: 'El informe contiene comprobaciones del teléfono y tiempos de respuesta. No incluye tus preguntas ni respuestas. No se envía nada automáticamente.',
    report: 'Copiar informe', copied: 'Informe copiado.', copyFailed: 'Selecciona y copia el informe de abajo.', reportText: 'Informe para copiar',
    reportCaveat: 'Estas comprobaciones no demuestran el modo avión ni evalúan si los consejos de salud son correctos.',
    seconds: 'segundos',
  },
}

const primary = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#17695F] px-5 py-3 font-bold text-white transition-colors hover:bg-[#2E8E82] disabled:cursor-not-allowed disabled:opacity-50'
const secondary = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[#CFE5E0] bg-white px-5 py-3 font-bold text-[#17695F] transition-colors hover:bg-[#EFFAF8] dark:bg-kit-dark-bg-light dark:text-teal-200 dark:border-slate-600 disabled:cursor-not-allowed disabled:opacity-50'
const booleanOrNull = value => typeof value === 'boolean' ? value : null
const numberOrNull = value => Number.isFinite(value) && value >= 0 ? value : null

// Keep this trial independent of normal history and optional online speech.
const TrialMessage = memo(function TrialMessage({ role, content, sources, language }) {
  const isUser = role === 'user'
  return <div className={`mb-5 flex ${isUser ? 'justify-end' : 'justify-start'}`}>
    <div className={`max-w-[96%] min-w-0 rounded-3xl px-4 py-3 sm:max-w-[90%] sm:px-5 sm:py-4 ${isUser ? 'rounded-br-lg bg-[#E0F5F3] dark:bg-teal-950/40' : 'rounded-bl-lg border border-[#F9E6E2] bg-[#FFF5F3] dark:border-slate-700 dark:bg-kit-dark-bg'}`}>
      <p className="mb-1 text-xs font-extrabold text-slate-500 dark:text-slate-400">{isUser ? language === 'es' ? 'Tú' : 'You' : 'Kit'}</p>
      <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed [overflow-wrap:anywhere]">{content}</p>
      {!isUser && sources?.length > 0 && <div className="mt-3 border-t border-rose-100 pt-3 text-xs leading-relaxed dark:border-slate-700">
        <p className="font-bold">{language === 'es' ? 'Referencias que recibió Kit' : 'References Kit received'}</p>
        {sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center pr-3 text-[#17695F] underline underline-offset-2 dark:text-teal-200">{source.title}</a>)}
      </div>}
    </div>
  </div>
})

export default function MedicalModelTrial() {
  const { language, setLanguage } = useSettings()
  const local = useMedicalTrial()
  const c = copy[language] || copy.en
  const [messages, setMessages] = useState([])
  const [busy, setBusy] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [notice, setNotice] = useState('')
  const [runs, setRuns] = useState([])
  const [copyStatus, setCopyStatus] = useState('')
  const [reportText, setReportText] = useState('')
  const mounted = useRef(false)
  const controller = useRef(null)
  const conversationVersion = useRef(0)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; controller.current?.abort() }
  }, [])

  const newConversation = () => {
    conversationVersion.current++
    controller.current?.abort()
    if (controller.current) setStopping(true)
    setMessages([])
    setNotice('')
  }

  const send = async content => {
    if (controller.current || local.status !== 'ready' || !content.trim()) return
    const current = new AbortController()
    controller.current = current
    const version = conversationVersion.current
    const started = performance.now()
    const onlineAtStart = booleanOrNull(navigator.onLine)
    let sawOnline = onlineAtStart === true
    const onOnline = () => { sawOnline = true }
    window.addEventListener('online', onOnline)
    const answerId = `answer-${Date.now()}`
    const history = messages.filter(message => message.content.trim()).map(({ role, content: text }) => ({ role, content: text }))
    // Test conversations live only in component memory, never normal chat history.
    setMessages(previous => [...previous, { id: `question-${Date.now()}`, role: 'user', content }, { id: answerId, role: 'assistant', content: '' }])
    setBusy(true)
    setStopping(false)
    setNotice('')
    setCopyStatus('')
    setReportText('')
    let status = 'failed'
    try {
      const sources = getPromptGuideSources(content, history, { language })
      const answer = await local.send(content, history, text => {
        if (mounted.current && conversationVersion.current === version && !current.signal.aborted) {
          setMessages(previous => previous.map(message => message.id === answerId ? { ...message, content: text } : message))
        }
      }, current.signal)
      if (current.signal.aborted) throw new DOMException('Aborted', 'AbortError')
      status = typeof answer === 'string' && answer.trim() ? 'answered' : 'empty'
      if (mounted.current && conversationVersion.current === version) {
        setMessages(previous => status === 'answered'
          ? previous.map(message => message.id === answerId ? { ...message, content: answer, sources } : message)
          : previous.filter(message => message.id !== answerId))
        if (status === 'empty') setNotice('empty')
      }
    } catch (error) {
      status = current.signal.aborted || error?.name === 'AbortError' ? 'stopped' : 'failed'
      if (mounted.current && conversationVersion.current === version) {
        // Do not present an interrupted fragment as a completed answer.
        setMessages(previous => previous.filter(message => message.id !== answerId))
        setNotice(error?.name === 'PromptValidationError' ? 'shorten' : status)
      }
    } finally {
      window.removeEventListener('online', onOnline)
      controller.current = null
      if (mounted.current) {
        setBusy(false)
        setStopping(false)
        setRuns(previous => [...previous.slice(-11), {
          startedAt: new Date(Date.now() - (performance.now() - started)).toISOString(),
          elapsedMs: Math.round(performance.now() - started),
          language: language === 'es' ? 'es' : 'en',
          example: content === c.cut ? 'minor-cut' : content === c.burn ? 'butter-on-burn' : 'other',
          status, browserReportsOnlineAtStart: onlineAtStart,
          browserReportsOnlineAtEnd: booleanOrNull(navigator.onLine),
          browserReportedOfflineThroughout: onlineAtStart === false && !sawOnline && navigator.onLine === false,
        }])
      }
    }
  }

  const copyReport = async () => {
    const phone = makePhoneReport({ offlineApp: local.offlineApp, configuredModel: local.modelId })
    const report = {
      schema: 'kit-ai-medical-trial-v1', exportedAt: new Date().toISOString(),
      configuredModel: phone.configuredModel,
      note: 'Local learning trial. No questions or generated answers are included. Browser network flags do not independently verify airplane mode. Successful generation does not establish medical accuracy.',
      offlineApp: phone.offlineApp,
      status: local.status, offlineSaved: Boolean(local.offlineSaved),
      lastFailureStage: local.lastFailureStage || null,
      compatibility: {
        supported: booleanOrNull(local.check?.supported),
        reason: typeof local.check?.reason === 'string' ? local.check.reason.slice(0, 100) : null,
        shaderF16: booleanOrNull(local.check?.features?.shaderF16),
        modelCached: booleanOrNull(local.check?.modelCached),
        limits: {
          maxBufferSize: numberOrNull(local.check?.limits?.maxBufferSize),
          maxStorageBufferBindingSize: numberOrNull(local.check?.limits?.maxStorageBufferBindingSize),
          maxComputeWorkgroupStorageSize: numberOrNull(local.check?.limits?.maxComputeWorkgroupStorageSize),
          maxStorageBuffersPerShaderStage: numberOrNull(local.check?.limits?.maxStorageBuffersPerShaderStage),
        },
        requestedLimits: {
          maxBufferSize: numberOrNull(local.check?.requestedLimits?.maxBufferSize),
          maxStorageBufferBindingSize: numberOrNull(local.check?.requestedLimits?.maxStorageBufferBindingSize),
          maxComputeWorkgroupStorageSize: numberOrNull(local.check?.requestedLimits?.maxComputeWorkgroupStorageSize),
          maxStorageBuffersPerShaderStage: numberOrNull(local.check?.requestedLimits?.maxStorageBuffersPerShaderStage),
        },
        storage: {
          usageBytes: numberOrNull(local.check?.storage?.usageBytes),
          quotaBytes: numberOrNull(local.check?.storage?.quotaBytes),
          availableBytes: numberOrNull(local.check?.storage?.availableBytes),
        },
      },
      runs,
    }
    const text = JSON.stringify(report, null, 2)
    const copied = await copyPhoneReport(text)
    if (mounted.current) { setCopyStatus(copied ? 'copied' : 'copyFailed'); setReportText(copied ? '' : text) }
  }

  const size = (local.downloadGB || 1.83).toLocaleString(language, { maximumFractionDigits: 2 })
  const status = local.status
  const preparing = ['saving', 'downloading', 'loading'].includes(status)
  const downloadable = ['consent', 'paused', 'error', 'waiting'].includes(status)
  const progress = Math.min(100, Math.max(0, Number(local.progress) || 0))
  const lastRun = runs.at(-1)
  const statusTitle = status === 'ready' && local.offlineSaved ? c.saved : c[status] || c.checking
  const statusDetail = c[`${status}Detail`]?.replace('{size}', size)

  return <div className="min-h-screen bg-[#E0F5F3] text-slate-800 dark:bg-kit-dark-bg dark:text-kit-dark-text px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
    <header className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 pb-6">
      <KitLogo onNewConversation={newConversation} />
      <label className="flex items-center gap-2 text-sm font-bold">
        <span className="sr-only">{c.language}</span>
        <select aria-label={c.language} value={language} onChange={event => setLanguage(event.target.value)} className="h-12 rounded-full border border-[#CFE5E0] bg-white px-4 text-base text-slate-700 dark:bg-kit-dark-bg-light dark:text-kit-dark-text">
          <option value="en">English</option><option value="es">Español</option>
        </select>
      </label>
    </header>
    <main className="mx-auto max-w-3xl rounded-[2rem] bg-white p-5 shadow-sm dark:bg-kit-dark-bg-light sm:p-8">
      <a href="/" className="inline-flex min-h-11 items-center gap-2 font-bold text-[#17695F] dark:text-teal-200"><ArrowLeft size={18} aria-hidden="true" />{c.back}</a>
      <h1 className="mt-5 text-3xl font-extrabold leading-tight sm:text-4xl">{c.title}</h1>
      <p className="mt-4 rounded-3xl bg-[#FFF0F1] p-4 text-sm leading-relaxed text-[#8E3B46] dark:bg-rose-950/30 dark:text-rose-200">{c.intro}</p>
      <section aria-label={statusTitle} className="my-6 rounded-3xl bg-[#EFFAF8] p-5 dark:bg-kit-dark-bg">
        <h2 role="status" className="flex items-start gap-2 text-lg font-extrabold">{local.offlineSaved && <Check aria-hidden="true" className="mt-0.5 shrink-0 text-[#17695F] dark:text-teal-200" size={22} />}{statusTitle}</h2>
        {statusDetail && <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{statusDetail}</p>}
        {status === 'consent' && <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{c.consentNote}</p>}
        {preparing && <>
          {status === 'downloading' && <div className="mt-4"><progress aria-label={c.downloading} value={progress} max="100" className="h-3 w-full overflow-hidden rounded-full accent-[#17695F]" /><p className="mt-1 text-sm tabular-nums">{Math.round(progress)}%</p></div>}
          <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{c.saveWait}</p>
          <button onClick={local.pause} className={`${secondary} mt-4`}><Pause size={17} aria-hidden="true" />{c.pause}</button>
        </>}
        {downloadable && <button onClick={status === 'error' ? local.retry : local.prepare} className={`${primary} mt-4`}>
          {status === 'error' ? <RefreshCw size={18} aria-hidden="true" /> : <Download size={18} aria-hidden="true" />}
          {status === 'consent' ? c.download.replace('{size}', size) : status === 'paused' ? c.resume : c.retry}
        </button>}
        {status === 'ready' && <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{local.offlineSaved ? c.offlineSteps : c.saveWait}</p>}
      </section>
      {status === 'ready' && messages.length === 0 && <section className="mb-6">
        <h2 className="mb-3 font-extrabold">{c.samples}</h2>
        <div className="flex flex-col items-start gap-3">{[c.cut, c.burn].map(sample => <button key={sample} disabled={busy} onClick={() => send(sample)} className={`${secondary} text-left`}>{sample}</button>)}</div>
      </section>}
      {messages.length > 0 && <section aria-label={language === 'es' ? 'Conversación de prueba' : 'Trial conversation'} aria-busy={busy} className="min-w-0">
        {messages.filter(message => message.content).map(message => <TrialMessage key={message.id} role={message.role} content={message.content} sources={message.sources} language={language} />)}
      </section>}
      {busy && <div className="mb-4 flex flex-wrap items-center gap-3"><p role="status" className="text-sm text-slate-600 dark:text-slate-300">{stopping ? c.stopping : c.preparing}</p><button disabled={stopping} onClick={() => { setStopping(true); controller.current?.abort() }} className={secondary}>{c.stop}</button></div>}
      {notice && <p role="status" className="mb-4 rounded-2xl bg-[#FFF0F1] p-4 text-sm text-[#8E3B46] dark:bg-rose-950/30 dark:text-rose-200">{c[notice]}</p>}
      {!busy && !notice && lastRun?.status === 'answered' && messages.length > 0 && <p role="status" className="mb-3 text-sm text-[#17695F] dark:text-teal-200">{lastRun.browserReportedOfflineThroughout ? c.answeredOffline : c.answered} {c.followup}</p>}
      {(status === 'ready' || messages.length > 0) && <ChatInput onSend={send} disabled={status !== 'ready' || busy} placeholder={c.placeholder} />}
      <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{c.privacy}</p>
      <details className="mt-7 border-t border-slate-200 pt-2 dark:border-slate-700">
        <summary className="min-h-12 cursor-pointer py-3 font-bold">{c.help}</summary>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{c.reportDetail}</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{c.reportCaveat}</p>
        <p className="mt-3 break-words text-xs text-slate-500 dark:text-slate-400">{local.modelId}</p>
        {lastRun && <p className="mt-3 text-sm">{(lastRun.elapsedMs / 1000).toLocaleString(language, { maximumFractionDigits: 1 })} {c.seconds}</p>}
        <button onClick={copyReport} disabled={busy || status === 'checking'} className={`${secondary} mt-4`}>{c.report}</button>
        {copyStatus && <p role="status" className="mt-3 text-sm">{c[copyStatus]}</p>}
        {reportText && <div className="mt-3"><label htmlFor="trial-report" className="block text-sm font-bold">{c.reportText}</label><textarea id="trial-report" readOnly value={reportText} onFocus={event => event.target.select()} rows={8} spellCheck={false} className="mt-2 w-full rounded-2xl border border-slate-300 bg-white p-3 font-mono text-base dark:border-slate-600 dark:bg-kit-dark-bg" /></div>}
      </details>
    </main>
  </div>
}
