import { useState, useRef, useEffect } from 'react'
import { BookOpen, MessageCircle, History, Settings, Plus, WifiOff, Square, Trash2, ShieldCheck } from 'lucide-react'
import ChatInput from './ChatInput'
import ChatMessage from './ChatMessage'
import GuideLibrary from './GuideLibrary'
import KitLogo from './KitLogo'
import OfflineSetup from './OfflineSetup'
import SettingsPanel from './SettingsPanel'
import { useWebLLM } from '../hooks/useWebLLM'
import { useSettings } from '../contexts/SettingsContext'
import { useChatHistory } from '../contexts/ChatHistoryContext'
import { askMedicalModel, MEDICAL_MODEL } from '../services/onlineMedicalService'
import { searchGuides } from '../services/firstAidGuides'
import { getPromptGuideContext } from '../services/chatPrompt'
import { chooseAnswerSource } from '../services/offlinePolicy'
import { LOCAL_MODEL_LABEL } from '../services/localModelConfig'

const tabs = [
  { id: 'guides', icon: BookOpen }, { id: 'chat', icon: MessageCircle },
  { id: 'history', icon: History }, { id: 'settings', icon: Settings },
]
const sourceKeys = { device: 'sourceDevice', online: 'sourceOnline', guides: 'savedReference' }

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
  const [tab, setTab] = useState('guides')
  const [online, setOnline] = useState(navigator.onLine)
  const [busy, setBusy] = useState(false)
  const [streaming, setStreaming] = useState('')
  const [requestStatus, setRequestStatus] = useState('')
  const [requestError, setRequestError] = useState('')
  const [pendingConversation, setPendingConversation] = useState(null)
  const [offlineReady, setOfflineReady] = useState(false)
  const abortRef = useRef(null)
  const endRef = useRef(null)
  const mainRef = useRef(null)
  const local = useWebLLM()
  const { t, language, allowOnline } = useSettings()
  const { currentMessages, conversationsList, createNewConversation, loadConversation, deleteConversation, updateMessages, currentConversationId, storageError } = useChatHistory()
  const source = chooseAnswerSource({ localReady: local.status === 'ready', online, allowOnline })

  useEffect(() => {
    const updateNetwork = () => setOnline(navigator.onLine)
    window.addEventListener('online', updateNetwork)
    window.addEventListener('offline', updateNetwork)
    let active = true
    if ('serviceWorker' in navigator) navigator.serviceWorker.ready.then(() => { if (active) setOfflineReady(true) })
    const viewport = window.visualViewport
    const resize = () => document.documentElement.style.setProperty('--app-height', `${viewport?.height || window.innerHeight}px`)
    resize()
    viewport?.addEventListener('resize', resize)
    window.addEventListener('resize', resize)
    return () => {
      active = false
      window.removeEventListener('online', updateNetwork)
      window.removeEventListener('offline', updateNetwork)
      viewport?.removeEventListener('resize', resize)
      window.removeEventListener('resize', resize)
      document.documentElement.style.removeProperty('--app-height')
      abortRef.current?.abort()
    }
  }, [])
  useEffect(() => { mainRef.current?.scrollTo({ top: 0 }) }, [tab])
  useEffect(() => {
    if (tab === 'chat') endRef.current?.scrollIntoView({ block: 'end', behavior: 'instant' })
  }, [currentMessages, streaming, tab])

  const stop = () => abortRef.current?.abort()
  const newChat = () => {
    stop()
    createNewConversation()
    setStreaming('')
    setRequestError('')
    setTab('chat')
  }
  const handleSend = async content => {
    if (abortRef.current) return
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
        const reference = getPromptGuideContext(content, language)
        sources = searchGuides(content, language).flatMap(guide => guide.sources).filter(item => reference.includes(item.url))
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
    <div className="app-shell flex bg-white dark:bg-kit-dark-bg text-slate-800 dark:text-kit-dark-text overflow-hidden">
      <aside className="hidden md:flex w-60 shrink-0 flex-col bg-[#E0F5F3] dark:bg-kit-dark-bg-light p-6 border-r border-teal-100 dark:border-slate-700">
        <div className="mb-10"><KitLogo onNewConversation={newChat} /></div>
        <nav aria-label={t('mainNavigation')} className="space-y-2">
          {tabs.map(({ id, icon: Icon }) => <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined} className={`flex w-full gap-3 items-center min-h-12 px-4 rounded-xl font-bold ${tab === id ? 'bg-white dark:bg-kit-dark-bg text-teal-900 dark:text-teal-200' : 'text-slate-600 dark:text-slate-300 hover:bg-white/50'}`}><Icon size={20} />{t(id)}</button>)}
        </nav>
        <div className="mt-auto text-sm text-teal-900 dark:text-teal-200 pt-8"><ShieldCheck size={21} className="mb-2" /><p className="font-bold">{t(offlineReady ? 'guidesSaved' : 'guidesIncluded')}</p><p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{t('shortDisclaimer')}</p></div>
      </aside>
      <div className="flex-1 min-w-0 flex flex-col">
        <header style={{ paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))' }} className="flex shrink-0 items-center justify-between px-5 md:px-10 py-4 border-b border-slate-100 dark:border-slate-800 gap-3">
          <div className="md:hidden"><KitLogo onNewConversation={newChat} small /></div>
          <span className="hidden md:block font-bold">{t(tab)}</span>
          <span className="text-xs text-slate-600 dark:text-slate-300 flex gap-2 items-center">{!online && <WifiOff size={15} />}{t(!online ? 'offline' : offlineReady ? 'guidesSaved' : 'companion')}</span>
        </header>
        <div className="shrink-0 px-5 md:px-10 py-2.5 bg-rose-50 dark:bg-rose-950/20 text-[#87343B] dark:text-rose-200 text-xs sm:text-sm">{t('emergencyBanner')}</div>
        {storageError && <p role="status" className="px-5 py-2 text-amber-800 bg-amber-50 text-sm">{storageError}</p>}
        <main ref={mainRef} id="main-content" className="flex-1 overflow-y-auto min-h-0 px-5 md:px-10 py-7 md:py-10">
          <div className="max-w-3xl mx-auto">
            {tab === 'guides' && <>{!['ready', 'unsupported'].includes(local.status) && <OfflineSetup local={local} compact />}<GuideLibrary /></>}
            {tab === 'chat' && <>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4"><h1 className="text-2xl font-extrabold">{t('chat')}</h1><button onClick={newChat} className="kit-text-button"><Plus size={17} />{t('newChat')}</button></div>
              <OfflineSetup local={local} compact />
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400 mb-6">{t(source === 'online' ? 'onlineNotice' : source === 'device' ? 'deviceNotice' : 'guideNotice')}</p>
              {currentMessages.length === 0 && <div className="py-7 border-t border-slate-200 dark:border-slate-700"><h2 className="text-xl font-bold mb-3">{t('welcomeTitle')}</h2><p className="text-slate-600 dark:text-slate-300 mb-5">{t('welcomeDetail')}</p><div className="flex flex-wrap gap-2">{['starterCut', 'starterBurn'].map(key => <button key={key} disabled={busy} onClick={() => handleSend(t(key))} className="kit-mode text-left">{t(key)}</button>)}</div></div>}
              <div role="log" aria-label={t('conversation')} aria-live="polite">
                {currentMessages.map((message, index) => <div key={`${message.timestamp}-${index}`}><ChatMessage role={message.role} content={message.content} />{message.role === 'assistant' && <p className="text-xs text-slate-500 mb-5 ml-12">{t(sourceKeys[message.source] || 'previousConversation')}{message.sources?.length > 0 && <> · {t('referenceMaterial')}: {[...new Map(message.sources.map(item => [item.url, item])).values()].map(item => <a key={item.url} href={item.url} target="_blank" rel="noreferrer" className="underline mr-2">{item.title}</a>)}</>}</p>}</div>)}
                {busy && sameConversation && (streaming ? <ChatMessage role="assistant" content={streaming} /> : <p role="status" className="py-5 text-sm text-teal-800 dark:text-teal-200">{requestStatus}</p>)}
              </div>
              {requestError && <div role="alert" className="my-4 border-l-4 border-rose-400 p-4 bg-rose-50 dark:bg-rose-950/20 text-sm"><p>{requestError}</p><button onClick={() => setTab('guides')} className="kit-text-button mt-3">{t('openGuides')}</button></div>}
              <div ref={endRef} />
            </>}
            {tab === 'history' && <section><h1 className="text-3xl font-extrabold mb-3">{t('historyTitle')}</h1><p className="text-slate-600 dark:text-slate-400 mb-7">{t('historyDetail')}</p>{conversationsList.length === 0 ? <p>{t('noConversations')} <button onClick={() => setTab('chat')} className="underline text-teal-800 dark:text-teal-300">{t('askQuestion')}</button></p> : <div className="divide-y divide-slate-200 dark:divide-slate-700">{conversationsList.map(conversation => <div key={conversation.id} className="flex gap-3 items-center py-3"><button disabled={busy} onClick={() => { loadConversation(conversation.id); setRequestError(''); setTab('chat') }} className="flex-1 text-left p-2 min-w-0"><span className="block font-bold truncate">{conversation.title || t('conversation')}</span><span className="text-xs text-slate-500">{new Date(conversation.updatedAt).toLocaleDateString(language)}</span></button><button disabled={busy} aria-label={t('deleteConversation', { title: conversation.title || t('conversation') })} onClick={() => deleteConversation(conversation.id)} className="p-3 text-slate-500 hover:text-rose-700"><Trash2 size={19} /></button></div>)}</div>}</section>}
            {tab === 'settings' && <SettingsPanel local={local} />}
          </div>
        </main>
        {tab === 'chat' && <div className="shrink-0 border-t border-slate-100 dark:border-slate-800">{busy && <button onClick={stop} className="kit-text-button mx-auto mt-2 text-sm"><Square size={14} />{t('stopResponse')}</button>}<ChatInput key={currentConversationId || 'new'} onSend={handleSend} disabled={busy} placeholder={t('inputPlaceholder')} /></div>}
        <nav aria-label={t('mobileNavigation')} className="md:hidden shrink-0 flex border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-kit-dark-bg" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>{tabs.map(({ id, icon: Icon }) => <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined} className={`flex-1 min-h-16 flex flex-col items-center justify-center gap-1 text-xs font-bold ${tab === id ? 'text-teal-800 dark:text-teal-200 bg-teal-50 dark:bg-teal-950/30' : 'text-slate-500 dark:text-slate-400'}`}><Icon size={21} />{t(id)}</button>)}</nav>
      </div>
    </div>
  )
}
