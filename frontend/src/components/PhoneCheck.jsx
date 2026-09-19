import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Download, RefreshCw, Smartphone } from 'lucide-react'
import { useSettings } from '../contexts/SettingsContext'
import { LOCAL_MODEL_ID } from '../services/localModelConfig'
import { copyPhoneReport, inspectPhone, makePhoneReport, runPhoneLocalTest } from '../services/phoneCheckService'
import OfflineSetup from './OfflineSetup'

export const phoneCheckTitle = language => language === 'es' ? 'Probar sin internet' : 'Try without internet'

const copy = {
  en: {
    back: 'Back to Settings', intro: 'Check Kit before you need it without a connection. Follow these three steps on the phone you plan to use.',
    checking: 'Checking…', refresh: 'Check again', connection: 'Connection', connected: 'Internet appears available', disconnected: 'No internet connection detected', support: 'Help with a problem',
    setup: '1. Save Kit while you have internet', setupDetail: 'Kit and the guides save automatically. To try answers without internet, choose to save them below. This download uses about 750 MB. Keep Kit open until saving finishes.',
    install: 'Add Kit to your Home Screen', installDetail: 'On iPhone, use Share → Add to Home Screen if offered. On Android, open the browser menu and choose Add to Home screen or Install app.',
    separate: 'Open Kit from its new icon while you have internet and let it finish saving there too. Downloads may not be shared between different browsers or the Home Screen app.',
    airplane: '2. Turn off internet and reopen Kit', airplaneDetail: 'When saving is finished, turn on airplane mode and turn Wi-Fi off too. Close Kit, then open the same address in this browser, or use the same Home Screen icon. Come back to Settings → Try without internet.',
    waitForSave: 'Wait for Kit to finish saving before turning off internet.',
    confirmed: 'I turned off Wi-Fi and mobile data, closed Kit, and reopened it.',
    test: '3. Try a sample answer', testDetail: 'This asks Kit a short sample question on this phone. It does not use your conversations or send the question over the internet.',
    run: 'Try an answer', running: 'Preparing an answer…', stop: 'Stop', stopping: 'Stopping…', notReady: 'Finish saving Kit and preparing answers first.', chatBusy: 'Wait for your current answer to finish, then try again.',
    passedOnline: 'Kit answered on this phone. Follow step 2 to check it without internet.', passedOffline: 'Kit answered with no internet connection detected.', passedReopen: 'Kit answered after you reopened it without internet.', caveat: 'This checks whether answers work on this phone. It does not check whether health advice is correct.',
    failed: 'Kit could not finish the answer. Check that saving is complete and try again.', cancelled: 'Stopped. You can try again.', empty: 'Kit did not return an answer. Try again.', elapsed: 'Time taken', seconds: 'seconds', response: 'Sample answer',
    export: 'Save report', exportDetail: 'You can save or copy a report to share when asking for help. It contains these checks and the sample answer, without your conversations. Nothing is sent automatically.', browserInfo: 'Include phone and browser details', browserNote: 'These details can help us understand what went wrong.',
    copy: 'Copy report', copied: 'Report copied.', copyFailed: 'Automatic copying is unavailable. Select and copy the report below.', reportText: 'Report to copy',
  },
  es: {
    back: 'Volver a Ajustes', intro: 'Comprueba Kit antes de necesitarlo sin conexión. Sigue estos tres pasos en el teléfono que vayas a usar.',
    checking: 'Comprobando…', refresh: 'Volver a comprobar', connection: 'Conexión', connected: 'Parece que hay internet', disconnected: 'No se detecta conexión a internet', support: 'Ayuda con un problema',
    setup: '1. Guarda Kit mientras tengas internet', setupDetail: 'Kit y las guías se guardan automáticamente. Para probar las respuestas sin internet, elige guardarlas abajo. Esta descarga usa unos 750 MB. Mantén Kit abierto hasta que termine de guardarse.',
    install: 'Añadir Kit a la pantalla de inicio', installDetail: 'En iPhone, usa Compartir → Añadir a pantalla de inicio si aparece la opción. En Android, abre el menú del navegador y elige Añadir a pantalla de inicio o Instalar aplicación.',
    separate: 'Abre Kit desde el nuevo icono mientras tengas internet y deja que termine de guardarse allí también. Las descargas pueden no compartirse entre navegadores distintos o con la aplicación de la pantalla de inicio.',
    airplane: '2. Desactiva internet y vuelve a abrir Kit', airplaneDetail: 'Cuando termine de guardarse, activa el modo avión y desactiva también el Wi-Fi. Cierra Kit y abre la misma dirección en este navegador, o usa el mismo icono de la pantalla de inicio. Vuelve a Ajustes → Probar sin internet.',
    waitForSave: 'Espera a que Kit termine de guardarse antes de desactivar internet.',
    confirmed: 'Desactivé el Wi-Fi y los datos móviles, cerré Kit y lo volví a abrir.',
    test: '3. Prueba una respuesta', testDetail: 'Kit responde una breve pregunta de ejemplo en este teléfono. No usa tus conversaciones ni envía la pregunta por internet.',
    run: 'Probar una respuesta', running: 'Preparando una respuesta…', stop: 'Detener', stopping: 'Deteniendo…', notReady: 'Primero termina de guardar Kit y preparar las respuestas.', chatBusy: 'Espera a que termine tu respuesta actual y vuelve a intentarlo.',
    passedOnline: 'Kit respondió en este teléfono. Sigue el paso 2 para comprobarlo sin internet.', passedOffline: 'Kit respondió sin detectar conexión a internet.', passedReopen: 'Kit respondió después de que lo volvieras a abrir sin internet.', caveat: 'Esto comprueba si las respuestas funcionan en este teléfono. No comprueba si los consejos de salud son correctos.',
    failed: 'Kit no pudo terminar la respuesta. Comprueba que se haya guardado e inténtalo de nuevo.', cancelled: 'Se ha detenido. Puedes volver a intentarlo.', empty: 'Kit no dio una respuesta. Vuelve a intentarlo.', elapsed: 'Tiempo empleado', seconds: 'segundos', response: 'Respuesta de ejemplo',
    export: 'Guardar informe', exportDetail: 'Puedes guardar o copiar un informe para compartirlo al pedir ayuda. Contiene estas comprobaciones y la respuesta de ejemplo, sin tus conversaciones. No se envía nada automáticamente.', browserInfo: 'Incluir detalles del teléfono y del navegador', browserNote: 'Estos detalles pueden ayudarnos a entender qué falló.',
    copy: 'Copiar informe', copied: 'Informe copiado.', copyFailed: 'No se puede copiar automáticamente. Selecciona y copia el informe que aparece abajo.', reportText: 'Informe para copiar',
  },
}

export default function PhoneCheck({ local, chatBusy, onBusyChange, onBack, onOpenGuides }) {
  const { language, t } = useSettings()
  const c = copy[language] || copy.en
  const [capabilities, setCapabilities] = useState(null)
  const [checking, setChecking] = useState(true)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [running, setRunning] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [result, setResult] = useState(null)
  const [reopenedOffline, setReopenedOffline] = useState(false)
  const [includeBrowser, setIncludeBrowser] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')
  const [reportText, setReportText] = useState('')
  const controller = useRef(null)
  const mounted = useRef(false)
  const refreshId = useRef(0)
  const refresh = useCallback(async () => {
    const id = ++refreshId.current
    setChecking(true)
    const next = await inspectPhone()
    if (mounted.current && refreshId.current === id) { setCapabilities(next); setChecking(false) }
  }, [])

  useEffect(() => {
    mounted.current = true
    refresh()
    const updateNetwork = () => setOnline(navigator.onLine)
    window.addEventListener('online', updateNetwork)
    window.addEventListener('offline', updateNetwork)
    return () => {
      mounted.current = false
      refreshId.current++
      controller.current?.abort()
      window.removeEventListener('online', updateNetwork)
      window.removeEventListener('offline', updateNetwork)
    }
  }, [refresh])

  const run = async () => {
    if (controller.current || chatBusy || local.status !== 'ready' || !local.offlineSaved) return
    const current = new AbortController()
    controller.current = current
    setRunning(true)
    setStopping(false)
    setResult(null)
    setCopyStatus('')
    setReportText('')
    onBusyChange(true)
    try {
      const next = await runPhoneLocalTest({ sendMessage: local.sendMessage, language, ready: true, signal: current.signal, reopenedOffline })
      if (mounted.current) setResult(next)
    } finally {
      controller.current = null
      // The local generator drains on cancellation before another chat may start.
      onBusyChange(false)
      if (mounted.current) { setRunning(false); setStopping(false) }
    }
  }
  const serializeReport = () => JSON.stringify(makePhoneReport({ capabilities, offlineApp: local.offlineApp, result, configuredModel: LOCAL_MODEL_ID, includeBrowser, userAgent: navigator.userAgent }), null, 2)
  const copyReport = async () => {
    const text = serializeReport()
    const copied = await copyPhoneReport(text)
    if (mounted.current) { setCopyStatus(copied ? 'copied' : 'copyFailed'); setReportText(copied ? '' : text) }
  }
  const save = () => {
    const url = URL.createObjectURL(new Blob([serializeReport()], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'kit-ai-device-check.json'
    link.hidden = true
    document.body.append(link)
    try { link.click() } finally {
      link.remove()
      // Chrome's offline download can still be consuming the URL after 1s.
      // Keep the small report alive while the browser finishes saving it.
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    }
  }
  const readyToTry = local.offlineSaved && local.status === 'ready'
  const appIsSaved = local.offlineApp?.status === 'ready'
  const savingUnavailable = local.offlineApp?.status === 'unsupported'
  const resultText = result?.status === 'passed'
    ? result.browserOfflineThroughout ? result.userConfirmedOfflineReopen ? c.passedReopen : c.passedOffline : c.passedOnline
    : result?.status === 'cancelled' ? c.cancelled : result?.status === 'empty-response' ? c.empty : c.failed

  return <section className="max-w-xl space-y-7">
    <button onClick={onBack} className="kit-text-button"><ArrowLeft size={18} />{c.back}</button>
    <div><h1 className="text-3xl font-extrabold flex gap-3 items-start"><Smartphone className="shrink-0 mt-1 text-rose-500" />{phoneCheckTitle(language)}</h1><p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{savingUnavailable ? t('appUnsupportedDetail') : c.intro}</p></div>
    {savingUnavailable && <OfflineSetup local={local} />}
    {!savingUnavailable && <>
    <section><h2 className="font-bold text-lg">{c.setup}</h2><p className="text-sm leading-relaxed my-3 text-slate-600 dark:text-slate-300">{c.setupDetail}</p><OfflineSetup local={local} /><details className="text-sm"><summary className="font-bold cursor-pointer py-3">{c.install}</summary><p className="leading-relaxed mb-3">{c.installDetail}</p><p className="leading-relaxed text-slate-600 dark:text-slate-300">{c.separate}</p></details></section>
    <section><h2 className="font-bold text-lg">{c.airplane}</h2><p className="text-sm leading-relaxed mt-3 text-slate-600 dark:text-slate-300">{c.airplaneDetail}</p>{!appIsSaved && <p role="status" className="text-sm font-semibold mt-3 text-rose-700 dark:text-rose-200">{c.waitForSave}</p>}<label className="flex gap-3 items-start text-sm mt-4"><input type="checkbox" checked={reopenedOffline} disabled={running || !appIsSaved} onChange={event => setReopenedOffline(event.target.checked)} className="w-5 h-5 shrink-0 accent-teal-700" /><span>{c.confirmed}</span></label></section>
    <section><h2 className="font-bold text-lg">{language === 'es' ? '3. Abre una guía' : '3. Open a guide'}</h2><p className="text-sm leading-relaxed my-3 text-slate-600 dark:text-slate-300">{language === 'es' ? 'Las guías guardadas se pueden leer sin internet. No necesitas descargar las respuestas para usarlas.' : 'Saved guides can be read without internet. You do not need the large answers download to use them.'}</p><button onClick={onOpenGuides} className="kit-primary">{t('openGuides')}</button></section>
    <section><h2 className="font-bold text-lg">{language === 'es' ? 'Si guardaste las respuestas, prueba una' : 'If you saved answers, try one'}</h2><p className="text-sm leading-relaxed my-3 text-slate-600 dark:text-slate-300">{c.testDetail}</p>
      {running ? <div><p role="status" className="text-sm mb-3">{stopping ? c.stopping : c.running}</p><button className="kit-mode" disabled={stopping} onClick={() => { setStopping(true); controller.current?.abort() }}>{c.stop}</button></div> : <button className="kit-primary" disabled={chatBusy || !readyToTry} onClick={run}>{c.run}</button>}
      {!running && (chatBusy || !readyToTry) && <p className="text-sm mt-3 text-slate-500">{chatBusy ? c.chatBusy : c.notReady}</p>}
      {result && <div className="mt-4 rounded-xl border border-rose-200 dark:border-rose-900 p-4"><p role="status" className="font-bold">{resultText}</p><p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mt-3">{c.caveat}</p></div>}
    </section>
    </>}
    <details open={savingUnavailable || undefined} className="border-t border-slate-200 dark:border-slate-700 pt-2">
      <summary className="font-bold cursor-pointer min-h-12 flex items-center">{c.support}</summary>
      <div className="flex flex-wrap items-center justify-between gap-2 my-3"><p className="text-sm">{c.connection}: {online ? c.connected : c.disconnected}</p><button onClick={refresh} disabled={checking} className="kit-text-button text-sm"><RefreshCw size={15} />{checking ? c.checking : c.refresh}</button></div>
      {result && <div className="mb-4 text-sm"><p>{c.elapsed}: {(result.elapsedMs / 1000).toLocaleString(language, { maximumFractionDigits: 1 })} {c.seconds}</p>{result.response && <details><summary className="cursor-pointer py-2">{c.response}</summary><p className="whitespace-pre-wrap break-words">{result.response}</p></details>}</div>}
      <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">{c.exportDetail}</p>
      <label className="flex gap-3 items-start text-sm"><input type="checkbox" checked={includeBrowser} onChange={event => { setIncludeBrowser(event.target.checked); setCopyStatus(''); setReportText('') }} className="w-5 h-5 shrink-0 accent-teal-700" /><span>{c.browserInfo}<span className="block mt-1 text-xs text-slate-500">{c.browserNote}</span></span></label>
      <div className="flex flex-wrap gap-x-5"><button onClick={save} disabled={running || checking} className="kit-text-button mt-4"><Download size={18} />{c.export}</button><button onClick={copyReport} disabled={running || checking} className="kit-text-button mt-4">{c.copy}</button></div>
      {copyStatus && <p role="status" className="text-sm mt-3">{c[copyStatus]}</p>}
      {reportText && <div className="mt-3"><label htmlFor="device-check-report-text" className="block text-sm font-bold">{c.reportText}</label><textarea id="device-check-report-text" readOnly value={reportText} onFocus={event => event.target.select()} rows={8} spellCheck={false} className="mt-2 w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-kit-dark-bg-light p-3 font-mono text-base font-normal" /></div>}
    </details>
  </section>
}
