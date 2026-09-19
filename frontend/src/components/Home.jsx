import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { BookOpen, MessageCircle, History, Settings, Plus, WifiOff, Square, Trash2, ShieldCheck } from 'lucide-react'
import ChatInput from './ChatInput'
import ChatMessage from './ChatMessage'
import GuideLibrary from './GuideLibrary'
import KitLogo from './KitLogo'
import OfflineSetup from './OfflineSetup'
import SettingsPanel from './SettingsPanel'
import PhoneCheck, { phoneCheckTitle } from './PhoneCheck'
import { useChatScroll } from '../hooks/useChatScroll'
import { useChatViewport } from '../hooks/useChatViewport'
import { useWebLLM } from '../hooks/useWebLLM'
import { useSettings } from '../contexts/SettingsContext'
import { useChatHistory } from '../contexts/ChatHistoryContext'
import { askMedicalModel, MEDICAL_MODEL } from '../services/onlineMedicalService'
import { searchGuides } from '../services/firstAidGuides'
import { getPromptGuideSources } from '../services/chatPrompt'
import { chooseAnswerSource } from '../services/offlinePolicy'
import { LOCAL_MODEL_LABEL } from '../services/localModelConfig'

const tabs = [
  { id: 'guides', icon: BookOpen }, { id: 'chat', icon: MessageCircle },
  { id: 'history', icon: History }, { id: 'settings', icon: Settings },
]

function referenceAnswer(question, language, t) {
  const guides = searchGuides(question, language).slice(0, 1)
  if (!guides.length) return { answer: t('noGuide'), sources: [] }
  const guide = guides[0]
  return {
    answer: [t('guideAnswerIntro'), guide.title, `${t('scope')}: ${guide.scope}`, guide.summary,
      ...guide.steps.map((step, index) => `${index + 1}. ${step}`),
      `${t('whenToGetHelp')}:`, ...guide.redFlags.map(flag => `• ${flag}`),
    ].join('\n\n'),
    sources: guide.sources,
  }
}

export default function Home() {
  const [tab, setTab] = useState(() => window.location.hash === '#device-check' ? 'device-check' : 'guides')
  const [online, setOnline] = useState(navigator.onLine)
  const [busy, setBusy] = useState(false)
  const [diagnosticBusy, setDiagnosticBusy] = useState(false)
  const [streaming, setStreaming] = useState('')
  const [requestStatus, setRequestStatus] = useState('')
  const [requestError, setRequestError] = useState('')
  const [pendingConversation, setPendingConversation] = useState(null)
  const abortRef = useRef(null)
  const shellRef = useRef(null)
  const contentRef = useRef(null)
  const mainRef = useRef(null)
  const local = useWebLLM()
  const offlineReady = local.offlineApp.status === 'ready'
  const { t, language, allowOnline } = useSettings()
  const { currentMessages, conversationsList, createNewConversation, loadConversation, deleteConversation, updateMessages, currentConversationId, storageError } = useChatHistory()
  const scrollToLatest = useChatScroll(mainRef, contentRef, tab === 'chat', currentConversationId, currentMessages.length > 0)
  useChatViewport(shellRef, tab === 'chat')
  const source = chooseAnswerSource({ localReady: local.status === 'ready', online, allowOnline })

  useEffect(() => {
    const updateNetwork = () => setOnline(navigator.onLine)
    window.addEventListener('online', updateNetwork)
    window.addEventListener('offline', updateNetwork)
    return () => {
      window.removeEventListener('online', updateNetwork)
      window.removeEventListener('offline', updateNetwork)
      abortRef.current?.abort()
    }
  }, [])
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    if (tab !== 'chat') mainRef.current?.scrollTo({ top: 0, behavior: 'instant' })
    const url = `${window.location.pathname}${window.location.search}${tab === 'device-check' ? '#device-check' : ''}`
    window.history.replaceState(null, '', url)
  }, [tab])

  const stop = () => abortRef.current?.abort()
  const newChat = () => {
    stop()
    createNewConversation()
    setStreaming('')
    setRequestError('')
    setTab('chat')
  }
  const handleSend = async content => {
    if (abortRef.current || diagnosticBusy) return
    scrollToLatest()
    const controller = new AbortController()
    abortRef.current = controller
    // Select once for this request; never move an in-flight private question to a server.
    const requestSource = source
    const convId = currentConversationId || createNewConversation()
    const priorMessages = currentMessages
    updateMessages({ role: 'user', content, source: requestSource }, convId)
    setPendingConversation(convId)
    setBusy(true)
    setStreaming('')
    setRequestError('')
    setRequestStatus(t(requestSource === 'online' ? 'connecting' : 'thinking'))
    try {
      let answer, sources
      if (requestSource === 'guides') {
        ;({ answer, sources } = referenceAnswer(content, language, t))
      } else {
        answer = requestSource === 'online'
          ? await askMedicalModel(content, priorMessages.filter(message => message.source === 'online'), { language, signal: controller.signal, onStatus: () => setRequestStatus(t('waiting')) })
          : await local.sendMessage(content, priorMessages, setStreaming, controller.signal)
        sources = getPromptGuideSources(content, requestSource === 'online' ? priorMessages.filter(message => message.source === 'online') : priorMessages, { language })
      }
      if (!controller.signal.aborted) updateMessages({ role: 'assistant', content: answer, source: requestSource, model: requestSource === 'online' ? MEDICAL_MODEL : requestSource === 'device' ? LOCAL_MODEL_LABEL : null, sources }, convId)
    } catch (err) {
      if (!controller.signal.aborted && err.name !== 'AbortError') setRequestError(err.name === 'PromptValidationError' ? err.message : t('answerUnavailable'))
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
        setStreaming('')
        setBusy(false)
        setPendingConversation(null)
      }
    }
  }
  const sameConversation = pendingConversation === currentConversationId

  return (
    <div ref={shellRef} className={`app-shell flex text-slate-800 dark:text-kit-dark-text ${tab === 'chat' ? 'is-chat' : ''}`}>
      <aside className="hidden md:flex kit-sidebar w-60 shrink-0 flex-col p-6">
        <div className="mb-10"><KitLogo onNewConversation={newChat} /></div>
        <nav aria-label={t('mainNavigation')} className="space-y-2">
          {tabs.map(({ id, icon: Icon }) => <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined} className={`flex w-full gap-3 items-center min-h-12 px-4 rounded-full font-bold ${tab === id ? 'bg-white dark:bg-kit-dark-bg text-teal-900 dark:text-teal-200' : 'text-slate-600 dark:text-slate-300 hover:bg-white/60'}`}><Icon size={20} className="text-[#B54F61] dark:text-kit-red" />{t(id)}</button>)}
        </nav>
        <div className="mt-auto text-sm text-teal-900 dark:text-teal-200 pt-8"><ShieldCheck size={21} className="mb-2" /><p className="font-bold">{t(offlineReady ? 'guidesSaved' : 'guidesIncluded')}</p><p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{t('shortDisclaimer')}</p></div>
      </aside>
      <div className="kit-panel flex-1 min-w-0 min-h-0 flex flex-col">
        <header style={{ paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))' }} className="kit-header flex shrink-0 items-center justify-between px-5 md:px-10 py-4 gap-3">
          <div className="md:hidden"><KitLogo onNewConversation={newChat} small /></div>
          <span className="hidden md:block font-bold">{tab === 'device-check' ? phoneCheckTitle(language) : t(tab)}</span>
          <span className="max-w-[13rem] text-right text-xs text-slate-600 dark:text-slate-300 flex gap-2 items-center">{!online && <WifiOff size={15} />}{t(!online ? 'offline' : offlineReady ? 'guidesSaved' : 'companion')}</span>
        </header>
        <main ref={mainRef} id="main-content" className="kit-main flex-1 min-h-0">
          <div ref={contentRef} className="kit-content px-5 md:px-10 pb-7 md:pb-10">
            <div className="max-w-3xl mx-auto">
            <p className="mb-6 rounded-2xl px-4 py-3 bg-[#FFF0F1] dark:bg-rose-950/20 text-[#87343B] dark:text-rose-200 text-xs sm:text-sm leading-relaxed">{t('emergencyBanner')}</p>
            {storageError && <p role="status" className="mb-5 rounded-2xl px-4 py-3 text-amber-800 bg-amber-50 text-sm">{storageError}</p>}
            {tab === 'guides' && <>{(!offlineReady || (!local.needsDownloadConsent && !['ready', 'unsupported', 'paused'].includes(local.status))) && <OfflineSetup local={local} compact onSupport={() => setTab('device-check')} />}<GuideLibrary /></>}
            {tab === 'chat' && <>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4"><h1 className="text-2xl font-extrabold">{t('chat')}</h1><button onClick={newChat} className="kit-text-button"><Plus size={17} />{t('newChat')}</button></div>
              {(!offlineReady || (!local.needsDownloadConsent && local.status !== 'ready')) && <OfflineSetup local={local} compact onSupport={() => setTab('device-check')} />}
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400 mb-6">{t(source === 'online' ? 'onlineNotice' : source === 'device' ? 'deviceNotice' : 'guideNotice')}</p>
              {currentMessages.length === 0 && <div className="p-5 sm:p-7 rounded-[2rem] bg-[#F0FAF8] dark:bg-kit-dark-bg-light"><h2 className="text-xl font-bold mb-3">{t('welcomeTitle')}</h2><p className="text-slate-600 dark:text-slate-300 mb-5">{t('welcomeDetail')}</p><div className="flex flex-wrap gap-2">{['starterCut', 'starterBurn'].map(key => <button key={key} disabled={busy || diagnosticBusy} onClick={() => handleSend(t(key))} className="kit-mode text-left">{t(key)}</button>)}</div></div>}
              {diagnosticBusy && <p role="status" className="text-sm py-3">{language === 'es' ? 'Terminando la comprobación…' : 'Finishing the check…'}</p>}
              <div role="log" aria-label={t('conversation')} aria-live="polite">
                {currentMessages.map((message, index) => <div key={`${message.timestamp}-${index}`}><ChatMessage role={message.role} content={message.content} />{message.role === 'assistant' && (message.source === 'guides' || message.sources?.length > 0) && <p className="text-xs text-slate-500 mb-5 ml-12">{t(message.source === 'guides' ? 'savedReference' : 'sources')}{message.sources?.length > 0 && <>: {[...new Map(message.sources.map(item => [item.url, item])).values()].map(item => <a key={item.url} href={item.url} target="_blank" rel="noreferrer" className="underline mr-2">{item.title}</a>)}</>}</p>}</div>)}
                {busy && sameConversation && (streaming ? <ChatMessage role="assistant" content={streaming} /> : <p role="status" className="py-5 text-sm text-teal-800 dark:text-teal-200">{requestStatus}</p>)}
              </div>
              {requestError && <div role="alert" className="my-4 border-l-4 border-rose-400 p-4 bg-rose-50 dark:bg-rose-950/20 text-sm"><p>{requestError}</p><button onClick={() => setTab('guides')} className="kit-text-button mt-3">{t('openGuides')}</button></div>}
            </>}
            {tab === 'history' && <section><h1 className="text-3xl font-extrabold mb-3">{t('historyTitle')}</h1><p className="text-slate-600 dark:text-slate-400 mb-7">{t('historyDetail')}</p>{conversationsList.length === 0 ? <p>{t('noConversations')} <button onClick={() => setTab('chat')} className="underline text-teal-800 dark:text-teal-300">{t('askQuestion')}</button></p> : <div className="space-y-3">{conversationsList.map(conversation => <div key={conversation.id} className="flex gap-3 items-center p-3 rounded-3xl border border-[#DCEDE9] dark:border-slate-700 bg-[#F8FCFB] dark:bg-kit-dark-bg-light"><button disabled={busy} onClick={() => { loadConversation(conversation.id); setRequestError(''); setTab('chat') }} className="flex-1 text-left p-2 min-w-0"><span className="block font-bold truncate">{conversation.title || t('conversation')}</span><span className="text-xs text-slate-500">{new Date(conversation.updatedAt).toLocaleDateString(language)}</span></button><button disabled={busy} aria-label={t('deleteConversation', { title: conversation.title || t('conversation') })} onClick={() => deleteConversation(conversation.id)} className="p-3 rounded-full text-slate-500 hover:text-rose-700"><Trash2 size={19} /></button></div>)}</div>}</section>}
            {tab === 'settings' && <SettingsPanel local={local} onCheckDevice={() => setTab('device-check')} />}
            {tab === 'device-check' && <PhoneCheck local={local} chatBusy={busy || diagnosticBusy} onBusyChange={setDiagnosticBusy} onBack={() => setTab('settings')} onOpenGuides={() => setTab('guides')} />}
            </div>
          </div>
        </main>
        {tab === 'chat' && <div className="kit-composer shrink-0">{busy && <button onClick={stop} className="kit-text-button mx-auto mt-2 text-sm"><Square size={14} />{t('stopResponse')}</button>}<ChatInput key={currentConversationId || 'new'} onSend={handleSend} disabled={busy || diagnosticBusy} placeholder={t('inputPlaceholder')} /></div>}
        <nav aria-label={t('mobileNavigation')} className="kit-mobile-nav md:hidden shrink-0 flex gap-1 px-2 pt-2">{tabs.map(({ id, icon: Icon }) => <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined} className={`min-w-0 flex-1 min-h-14 rounded-2xl px-1 py-2 flex flex-col items-center justify-center gap-1 text-xs font-bold ${tab === id ? 'text-teal-800 dark:text-teal-200 bg-[#E0F5F3] dark:bg-teal-950/30' : 'text-slate-500 dark:text-slate-400'}`}><Icon size={21} />{t(id)}</button>)}</nav>
      </div>
    </div>
  )
}
