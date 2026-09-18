import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Download, RefreshCw, Smartphone } from 'lucide-react'
import { useSettings } from '../contexts/SettingsContext'
import { LOCAL_MODEL_ID } from '../services/localModelConfig'
import { copyPhoneReport, inspectPhone, makePhoneReport, runPhoneLocalTest } from '../services/phoneCheckService'
import OfflineSetup from './OfflineSetup'

export const phoneCheckTitle = language => language === 'es' ? 'Comprobar este dispositivo' : 'Check this device'

const copy = {
  en: {
    back: 'Back to Settings', intro: 'Check this browser, then try a fresh response using only the AI on this device. Capability checks do not download a model or prove offline AI works.',
    capabilities: 'Browser check', checking: 'Checking…', refresh: 'Refresh checks', yes: 'Yes', no: 'No', unknown: 'Not available',
    connection: 'Connection', connected: 'Browser reports online', disconnected: 'Browser reports offline', graphics: 'Graphics support', detected: 'Detected; model still needs a test', unavailable: 'Not detected', savedApp: 'Saved app', savedDetected: 'Saved files detected; reopen to verify', notConfirmed: 'Not confirmed', storageSpace: 'Storage space', estimatedLimit: 'estimated browser limit', technical: 'Technical details',
    network: 'Browser reports a connection', gpu: 'Graphics adapter available in a worker', secure: 'Secure page', controlled: 'Saved-page service controls this page', registered: 'Saved-page service registered',
    storage: 'Browser storage estimate', used: 'used', quota: 'quota', persistent: 'Persistent storage granted', appCaches: 'App cache containers found', modelCaches: 'Model cache containers found',
    cacheNote: 'A cache container may be empty or incomplete. Storage estimates are approximate; files can be removed by the browser. An available graphics adapter does not guarantee enough memory for the model.',
    setup: '1. Prepare this browser while online', setupDetail: 'Keep KIT open until setup finishes. Preparation can download the model using your existing setup preference. This check uses the same local engine as Chat.',
    install: 'Browser and Home Screen', installDetail: 'On iPhone in Safari, use Share → Add to Home Screen. In Chrome on iPhone, look for Add to Home Screen in the Share menu. On Android in Chrome, open the menu and choose Add to Home screen or Install app, when offered. Safari is not an Android browser.',
    separate: 'Prepare and test the exact browser or installed Home Screen app you plan to use. Do not assume a download in Safari, Chrome, or one installed app is shared with the others.',
    airplane: '2. Reopen without a connection', airplaneDetail: 'Turn on airplane mode, turn Wi-Fi off too, close KIT, and reopen this same address or installed app. Return to Settings → Check this device. Wait for the saved local model to load. This page can also be reopened at #device-check.',
    confirmed: 'I turned off Wi-Fi and mobile data, closed KIT, and reopened it.',
    test: '3. Generate a local test response', testDetail: 'This sends a fixed harmless prompt to the local model with no chat history and no cloud fallback. Keep the app open. The test does not evaluate medical accuracy.',
    run: 'Run local test', running: 'Generating on this device…', stop: 'Stop test', stopping: 'Stopping; waiting for the local engine…', notReady: 'Finish local setup before running the test.', chatBusy: 'Wait for the current chat response to finish before testing.',
    passedOnline: 'Local response passed; offline use not verified.', passedOffline: 'Local response passed while the browser reported offline.', passedReopen: 'Local response passed after your reported offline reopen.', caveat: 'The browser cannot independently confirm airplane mode or that the app was reopened. These results apply only to this run.',
    failed: 'No completed local response. Check setup, then retry.', cancelled: 'Test stopped. No pass recorded.', empty: 'The model returned no text. No pass recorded.', elapsed: 'Generation time', seconds: 'seconds', response: 'Fresh test response',
    export: 'Save diagnostic report', exportDetail: 'Saves a JSON file locally with these checks and this synthetic test only. It contains no conversations and is not uploaded.', browserInfo: 'Include browser information (user-agent text)', browserNote: 'This may help identify browser versions; it does not reliably identify the exact phone.',
    copy: 'Copy report', copied: 'Report copied.', copyFailed: 'Automatic copying is unavailable. Select and copy the report below.', reportText: 'Report to copy',
  },
  es: {
    back: 'Volver a Ajustes', intro: 'Comprueba este navegador y genera una respuesta nueva usando solo la IA de este dispositivo. Las comprobaciones no descargan un modelo ni demuestran que la IA funcione sin conexión.',
    capabilities: 'Comprobación del navegador', checking: 'Comprobando…', refresh: 'Actualizar comprobaciones', yes: 'Sí', no: 'No', unknown: 'No disponible',
    connection: 'Conexión', connected: 'El navegador indica que hay conexión', disconnected: 'El navegador indica que no hay conexión', graphics: 'Compatibilidad gráfica', detected: 'Detectada; falta probar el modelo', unavailable: 'No detectada', savedApp: 'Aplicación guardada', savedDetected: 'Archivos guardados detectados; vuelve a abrir para verificar', notConfirmed: 'Sin confirmar', storageSpace: 'Espacio de almacenamiento', estimatedLimit: 'límite estimado del navegador', technical: 'Detalles técnicos',
    network: 'El navegador indica que hay conexión', gpu: 'Adaptador gráfico disponible en un proceso de trabajo', secure: 'Página segura', controlled: 'El servicio de páginas guardadas controla esta página', registered: 'Servicio de páginas guardadas registrado',
    storage: 'Estimación de almacenamiento del navegador', used: 'usados', quota: 'cuota', persistent: 'Almacenamiento persistente concedido', appCaches: 'Contenedores de caché de la aplicación encontrados', modelCaches: 'Contenedores de caché del modelo encontrados',
    cacheNote: 'Un contenedor de caché puede estar vacío o incompleto. Las estimaciones son aproximadas; el navegador puede borrar los archivos. Un adaptador gráfico disponible no garantiza memoria suficiente para el modelo.',
    setup: '1. Prepara este navegador con conexión', setupDetail: 'Mantén KIT abierto hasta que termine la preparación. Esta puede descargar el modelo según tu ajuste de preparación. La comprobación usa la misma IA local que el chat.',
    install: 'Navegador y pantalla de inicio', installDetail: 'En un iPhone con Safari, usa Compartir → Añadir a pantalla de inicio. En Chrome para iPhone, busca Añadir a pantalla de inicio en el menú Compartir. En Android con Chrome, abre el menú y elige Añadir a pantalla de inicio o Instalar aplicación, si aparece. Safari no es un navegador para Android.',
    separate: 'Prepara y prueba el navegador o la aplicación instalada que vayas a usar. No des por hecho que una descarga en Safari, Chrome o una aplicación instalada se comparta con los demás.',
    airplane: '2. Vuelve a abrir KIT sin conexión', airplaneDetail: 'Activa el modo avión, desactiva también el Wi-Fi, cierra KIT y vuelve a abrir esta misma dirección o la aplicación instalada. Vuelve a Ajustes → Comprobar este dispositivo. Espera a que se cargue el modelo local guardado. También puedes reabrir esta página en #device-check.',
    confirmed: 'Desactivé el Wi-Fi y los datos móviles, cerré KIT y lo volví a abrir.',
    test: '3. Genera una respuesta de prueba local', testDetail: 'Envía una instrucción fija e inofensiva al modelo local, sin historial de chat ni alternativa en la nube. Mantén abierta la aplicación. Esta prueba no evalúa la exactitud médica.',
    run: 'Ejecutar prueba local', running: 'Generando en este dispositivo…', stop: 'Detener prueba', stopping: 'Deteniendo; esperando a la IA local…', notReady: 'Termina la preparación local antes de ejecutar la prueba.', chatBusy: 'Espera a que termine la respuesta del chat antes de probar.',
    passedOnline: 'Se generó una respuesta local; el uso sin conexión no está verificado.', passedOffline: 'Se generó una respuesta local mientras el navegador indicaba que no había conexión.', passedReopen: 'Se generó una respuesta local tras la reapertura sin conexión que indicaste.', caveat: 'El navegador no puede confirmar por sí solo el modo avión ni la reapertura de la aplicación. Estos resultados corresponden solo a esta prueba.',
    failed: 'No se completó una respuesta local. Revisa la preparación e inténtalo de nuevo.', cancelled: 'Prueba detenida. No se registró un resultado correcto.', empty: 'El modelo no devolvió texto. No se registró un resultado correcto.', elapsed: 'Tiempo de generación', seconds: 'segundos', response: 'Respuesta nueva de prueba',
    export: 'Guardar informe de diagnóstico', exportDetail: 'Guarda un archivo JSON local con estas comprobaciones y esta prueba sintética. No contiene conversaciones ni se sube a ningún servidor.', browserInfo: 'Incluir información del navegador (texto del agente de usuario)', browserNote: 'Puede ayudar a identificar la versión del navegador; no identifica de forma fiable el modelo exacto del teléfono.',
    copy: 'Copiar informe', copied: 'Informe copiado.', copyFailed: 'No se puede copiar automáticamente. Selecciona y copia el informe que aparece abajo.', reportText: 'Informe para copiar',
  },
}

export default function PhoneCheck({ local, chatBusy, onBusyChange, onBack }) {
  const { language } = useSettings()
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
    if (controller.current || chatBusy || local.status !== 'ready') return
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
  const serializeReport = () => JSON.stringify(makePhoneReport({ capabilities, result, configuredModel: LOCAL_MODEL_ID, includeBrowser, userAgent: navigator.userAgent }), null, 2)
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
  const yesNo = value => value === true ? c.yes : value === false ? c.no : c.unknown
  const bytes = value => value == null ? c.unknown : `${(value / 1024 / 1024).toLocaleString(language, { maximumFractionDigits: 0 })} MB`
  const resultText = result?.status === 'passed'
    ? result.browserOfflineThroughout ? result.userConfirmedOfflineReopen ? c.passedReopen : c.passedOffline : c.passedOnline
    : result?.status === 'cancelled' ? c.cancelled : result?.status === 'empty-response' ? c.empty : c.failed

  return <section className="max-w-xl space-y-7">
    <button onClick={onBack} className="kit-text-button"><ArrowLeft size={18} />{c.back}</button>
    <div><h1 className="text-3xl font-extrabold flex gap-3 items-start"><Smartphone className="shrink-0 mt-1 text-rose-500" />{phoneCheckTitle(language)}</h1><p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{c.intro}</p></div>
    <section className="p-5 rounded-2xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">{c.capabilities}</h2><button onClick={refresh} disabled={checking} className="kit-text-button text-sm"><RefreshCw size={15} />{checking ? c.checking : c.refresh}</button></div>
      <CheckRows items={[[c.connection, online ? c.connected : c.disconnected], [c.graphics, capabilities?.workerWebGPU === true ? c.detected : capabilities?.workerWebGPU === false ? c.unavailable : c.unknown], [c.savedApp, capabilities?.serviceWorkerControlsPage && capabilities?.caches.appCacheContainers > 0 ? c.savedDetected : c.notConfirmed], [c.storageSpace, `${bytes(capabilities?.storage.usageBytes)} ${c.used} / ${bytes(capabilities?.storage.quotaBytes)} ${c.estimatedLimit}`]]} />
      <details className="mt-3 text-sm"><summary className="cursor-pointer py-3 font-bold">{c.technical}</summary><CheckRows items={[[c.secure, yesNo(capabilities?.secureContext)], [c.gpu, yesNo(capabilities?.workerWebGPU)], [c.registered, yesNo(capabilities?.serviceWorkerRegistered)], [c.controlled, yesNo(capabilities?.serviceWorkerControlsPage)], [c.persistent, yesNo(capabilities?.storage.persistent)], [c.appCaches, capabilities?.caches.appCacheContainers ?? c.unknown], [c.modelCaches, capabilities?.caches.modelContainers == null ? c.unknown : `${capabilities.caches.modelContainers} / 3`]]} /><p className="text-xs leading-relaxed mt-4 text-slate-500 dark:text-slate-400">{c.cacheNote}</p></details>
    </section>
    <section><h2 className="font-bold text-lg">{c.setup}</h2><p className="text-sm leading-relaxed my-3 text-slate-600 dark:text-slate-300">{c.setupDetail}</p><OfflineSetup local={local} /><details className="text-sm"><summary className="font-bold cursor-pointer py-3">{c.install}</summary><p className="leading-relaxed mb-3">{c.installDetail}</p><p className="leading-relaxed text-slate-600 dark:text-slate-300">{c.separate}</p></details></section>
    <section><h2 className="font-bold text-lg">{c.airplane}</h2><p className="text-sm leading-relaxed mt-3 text-slate-600 dark:text-slate-300">{c.airplaneDetail}</p><label className="flex gap-3 items-start text-sm mt-4"><input type="checkbox" checked={reopenedOffline} disabled={running} onChange={event => setReopenedOffline(event.target.checked)} className="w-5 h-5 shrink-0 accent-teal-700" /><span>{c.confirmed}</span></label></section>
    <section><h2 className="font-bold text-lg">{c.test}</h2><p className="text-sm leading-relaxed my-3 text-slate-600 dark:text-slate-300">{c.testDetail}</p>
      {running ? <div><p role="status" className="text-sm mb-3">{stopping ? c.stopping : c.running}</p><button className="kit-mode" disabled={stopping} onClick={() => { setStopping(true); controller.current?.abort() }}>{c.stop}</button></div> : <button className="kit-primary" disabled={chatBusy || local.status !== 'ready'} onClick={run}>{c.run}</button>}
      {!running && (chatBusy || local.status !== 'ready') && <p className="text-sm mt-3 text-slate-500">{chatBusy ? c.chatBusy : c.notReady}</p>}
      {result && <div className="mt-4 rounded-xl border border-rose-200 dark:border-rose-900 p-4"><p role="status" className="font-bold">{resultText}</p><p className="text-sm my-2">{c.elapsed}: {(result.elapsedMs / 1000).toLocaleString(language, { maximumFractionDigits: 1 })} {c.seconds}</p>{result.response && <details className="text-sm"><summary className="cursor-pointer py-2">{c.response}</summary><p className="whitespace-pre-wrap break-words">{result.response}</p></details>}<p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-3">{c.caveat}</p></div>}
    </section>
    <section className="border-t border-slate-200 dark:border-slate-700 pt-5">
      <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">{c.exportDetail}</p>
      <label className="flex gap-3 items-start text-sm"><input type="checkbox" checked={includeBrowser} onChange={event => { setIncludeBrowser(event.target.checked); setCopyStatus(''); setReportText('') }} className="w-5 h-5 shrink-0 accent-teal-700" /><span>{c.browserInfo}<span className="block mt-1 text-xs text-slate-500">{c.browserNote}</span></span></label>
      <div className="flex flex-wrap gap-x-5"><button onClick={save} disabled={running || checking} className="kit-text-button mt-4"><Download size={18} />{c.export}</button><button onClick={copyReport} disabled={running || checking} className="kit-text-button mt-4">{c.copy}</button></div>
      {copyStatus && <p role="status" className="text-sm mt-3">{c[copyStatus]}</p>}
      {reportText && <div className="mt-3"><label htmlFor="device-check-report-text" className="block text-sm font-bold">{c.reportText}</label><textarea id="device-check-report-text" readOnly value={reportText} onFocus={event => event.target.select()} rows={8} spellCheck={false} className="mt-2 w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-kit-dark-bg-light p-3 font-mono text-base font-normal" /></div>}
    </section>
  </section>
}

function CheckRows({ items }) {
  return <dl className="mt-4 divide-y divide-rose-100 dark:divide-slate-700 text-sm">{items.map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-x-5 gap-y-1 py-2.5"><dt className="text-slate-600 dark:text-slate-300">{label}</dt><dd className="font-semibold">{value}</dd></div>)}</dl>
}
