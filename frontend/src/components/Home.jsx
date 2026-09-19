import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { ArrowLeft, BookOpen, History, Settings, MoreHorizontal, Square, Trash2, Check } from 'lucide-react'
import ChatInput from './ChatInput'
import ChatMessage from './ChatMessage'
import GuideLibrary from './GuideLibrary'
import KitLogo from './KitLogo'
import AssistantSetup from './AssistantSetup'
import SimpleSettings from './SimpleSettings'
import { useChatScroll } from '../hooks/useChatScroll'
import { useChatViewport } from '../hooks/useChatViewport'
import { useOfflineAssistant } from '../hooks/useOfflineAssistant'
import { useSettings } from '../contexts/SettingsContext'
import { useChatHistory } from '../contexts/ChatHistoryContext'
import { askMedicalModel, MEDICAL_MODEL } from '../services/onlineMedicalService'
import { getPromptGuideSources } from '../services/chatPrompt'
import { chooseAssistantSource } from '../services/assistantPolicy'
import { simpleChatCopy } from '../utils/simpleChatCopy'

export default function Home() {
  const [page, setPage] = useState('chat')
  const [menuOpen, setMenuOpen] = useState(false)
  const [setupDismissed, setSetupDismissed] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [busy, setBusy] = useState(false)
  const [streaming, setStreaming] = useState('')
  const [requestError, setRequestError] = useState('')
  const [failedRequest, setFailedRequest] = useState(null)
  const [pendingConversation, setPendingConversation] = useState(null)
  const [drafts, setDrafts] = useState({})
  const abortRef = useRef(null)
  const shellRef = useRef(null)
  const contentRef = useRef(null)
  const mainRef = useRef(null)
  const menuRef = useRef(null)
  const menuButtonRef = useRef(null)
  const local = useOfflineAssistant()
  const { t, language, allowOnline } = useSettings()
  const c = simpleChatCopy[language] || simpleChatCopy.en
  const { currentMessages, conversationsList, createNewConversation, loadConversation, deleteConversation, updateMessages, currentConversationId, storageError } = useChatHistory()
  const scrollToLatest = useChatScroll(mainRef, contentRef, page === 'chat', currentConversationId, currentMessages.length > 0)
  useChatViewport(shellRef, page === 'chat')
  const source = chooseAssistantSource({ localReady: local.status === 'ready', online, allowOnline })
  const activeSetup = ['checking', 'saving', 'loading', 'downloading'].includes(local.status)
  const showSetup = !local.offlineSaved && (!setupDismissed || !source || local.status !== 'consent')
  const statusLabel = local.offlineSaved ? c.ready : local.status === 'ready' ? c.readyHere : activeSetup ? c.preparing : online ? c.internetNeeded : c.notReady

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
      abortRef.current?.abort()
    }
  }, [])
  useEffect(() => {
    if (!menuOpen) return
    const closeOutside = event => { if (!menuRef.current?.contains(event.target)) setMenuOpen(false) }
    const escape = event => { if (event.key === 'Escape') { setMenuOpen(false); menuButtonRef.current?.focus() } }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', escape) }
  }, [menuOpen])
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    if (page !== 'chat') mainRef.current?.scrollTo({ top: 0, behavior: 'instant' })
  }, [page])

  const navigate = next => { setMenuOpen(false); setPage(next) }
  const stop = () => abortRef.current?.abort()
  const newChat = () => {
    stop()
    createNewConversation()
    setStreaming('')
    setRequestError('')
    setFailedRequest(null)
    navigate('chat')
  }
  const runAnswer = async request => {
    const controller = new AbortController()
    abortRef.current = controller
    setPendingConversation(request.convId)
    setBusy(true)
    setStreaming('')
    setRequestError('')
    setFailedRequest(null)
    try {
      // A failed local question stays local on retry, even if Wi-Fi returns.
      if (request.source === 'device' && local.status !== 'ready') await local.retry()
      if (controller.signal.aborted) return
      const history = request.history.filter(message => message.source !== 'guides' || message.role === 'user')
      const promptHistory = request.source === 'online' ? history.filter(message => message.source === 'online') : history
      const sources = getPromptGuideSources(request.content, promptHistory, { language })
      const answer = request.source === 'device'
        ? await local.sendMessage(request.content, promptHistory, text => { if (!controller.signal.aborted) setStreaming(text) }, controller.signal)
        : await askMedicalModel(request.content, promptHistory, { language, signal: controller.signal })
      if (typeof answer !== 'string' || !answer.trim()) throw new Error('Empty answer')
      if (!controller.signal.aborted) updateMessages({ role: 'assistant', content: answer, source: request.source, model: request.source === 'device' ? local.modelId : MEDICAL_MODEL, sources }, request.convId)
    } catch (error) {
      if (!controller.signal.aborted && error.name !== 'AbortError') {
        setFailedRequest(request)
        setRequestError(error.name === 'PromptValidationError' ? error.message : c.answerFailed)
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
        setStreaming('')
        setBusy(false)
        setPendingConversation(null)
      }
    }
  }
  const handleSend = content => {
    if (abortRef.current || !source) return false
    scrollToLatest()
    const convId = currentConversationId || createNewConversation()
    updateMessages({ role: 'user', content, source }, convId)
    void runAnswer({ content, convId, history: currentMessages, source })
    return true
  }
  const retryAnswer = () => {
    if (!failedRequest || abortRef.current) return
    // A ready local model may take over a failed online question. A question
    // originally kept on the device must never be promoted to an online call.
    const nextSource = failedRequest.source === 'device' ? 'device' : source
    if (!nextSource) return
    scrollToLatest()
    void runAnswer({ ...failedRequest, source: nextSource })
  }
  const sameConversation = pendingConversation === currentConversationId
  const retryVisible = failedRequest?.convId === currentConversationId

  return (
    <div ref={shellRef} className={`app-shell simple-kit flex text-slate-800 dark:text-kit-dark-text ${page === 'chat' ? 'is-chat' : ''}`}>
      <div className="kit-panel flex-1 min-w-0 min-h-0 flex flex-col">
        <header className="kit-header simple-header relative flex shrink-0 items-center justify-between gap-3 px-5 py-3 sm:px-8">
          <KitLogo onNewConversation={newChat} small />
          <div className="flex min-w-0 items-center gap-1 sm:gap-3">
            {page === 'chat' && <button type="button" onClick={() => { setSetupDismissed(false); mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' }) }} aria-label={statusLabel} className="flex min-h-11 min-w-0 items-center gap-1.5 rounded-full px-2 text-right text-xs font-bold text-[#286B60] dark:text-teal-200">
              {local.offlineSaved && <Check aria-hidden="true" size={15} className="shrink-0" />}<span role="status" className="max-w-[8.5rem]">{statusLabel}</span>
            </button>}
            <div ref={menuRef} className="relative">
              <button ref={menuButtonRef} aria-label={c.menu} aria-expanded={menuOpen} aria-controls="kit-options" onClick={() => setMenuOpen(value => !value)} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/70 text-[#286B60] dark:bg-slate-800 dark:text-teal-200"><MoreHorizontal aria-hidden="true" size={23} /></button>
              {menuOpen && <nav id="kit-options" aria-label={c.menu} className="absolute right-0 top-14 z-30 w-56 rounded-3xl border border-[#DCEDE9] bg-white p-2 shadow-lg dark:border-slate-600 dark:bg-kit-dark-bg-light">
                {[[History, 'history'], [BookOpen, 'guides'], [Settings, 'settings']].map(([Icon, id]) => <button key={id} onClick={() => navigate(id)} className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 text-left text-sm font-bold hover:bg-[#EFF9F6] dark:hover:bg-slate-700"><Icon size={18} aria-hidden="true" />{c[id]}</button>)}
              </nav>}
            </div>
          </div>
        </header>
        <main ref={mainRef} id="main-content" className="kit-main flex-1 min-h-0">
          <div ref={contentRef} className="kit-content px-5 pb-6 pt-2 sm:px-8">
            <div className="mx-auto max-w-2xl">
              {page !== 'chat' && <button onClick={() => navigate('chat')} className="kit-text-button mb-4 text-sm"><ArrowLeft size={17} aria-hidden="true" />{c.back}</button>}
              {storageError && <p role="status" className="mb-4 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">{storageError}</p>}
              {page === 'chat' && <>
                {currentMessages.length === 0 && <div className="pb-6 pt-6 sm:pt-12"><h1 className="text-[1.8rem] font-extrabold leading-tight sm:text-4xl">{c.welcome}</h1><p className="mt-2 text-base text-slate-500 dark:text-slate-300">{c.welcomeDetail}</p></div>}
                {showSetup && <AssistantSetup local={local} online={online} onDismiss={source === 'online' ? () => setSetupDismissed(true) : null} onHelp={() => navigate('settings')} />}
                <div role="log" aria-label={t('conversation')} aria-live="polite" aria-busy={busy && sameConversation}>
                  {currentMessages.map((message, index) => message.role === 'assistant' && message.source === 'guides'
                    ? <details key={`${message.timestamp}-${index}`} className="mb-5 rounded-2xl border border-slate-200 px-4 text-sm dark:border-slate-600"><summary className="min-h-11 cursor-pointer content-center text-slate-500">{c.oldGuide}</summary><p className="whitespace-pre-wrap pb-4 leading-relaxed">{message.content}</p></details>
                    : <div key={`${message.timestamp}-${index}`}><ChatMessage role={message.role} content={message.content} />{message.role === 'assistant' && message.sources?.length > 0 && <details className="mb-5 -mt-3 ml-10 text-xs text-slate-500 dark:text-slate-400"><summary className="min-h-11 cursor-pointer content-center">{c.sources}</summary><div className="flex flex-col items-start">{[...new Map(message.sources.map(item => [item.url, item])).values()].map(item => <a key={item.url} href={item.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center underline underline-offset-2">{item.title}</a>)}</div></details>}</div>)}
                  {busy && sameConversation && (streaming ? <ChatMessage role="assistant" content={streaming} /> : <p role="status" className="py-5 text-sm text-teal-800 dark:text-teal-200">{c.writing}</p>)}
                </div>
                {requestError && retryVisible && <div role="alert" className="my-4 rounded-2xl bg-[#FFF4F2] p-4 text-sm dark:bg-rose-950/20"><p>{requestError}</p><button disabled={busy || (failedRequest.source === 'online' && !source)} onClick={retryAnswer} className="kit-text-button mt-2">{c.retryAnswer}</button></div>}
              </>}
              {page === 'history' && <section><h1 className="mb-5 text-2xl font-extrabold">{c.history}</h1>{conversationsList.length === 0 ? <p className="text-slate-500">{c.historyEmpty}</p> : <div className="space-y-3">{conversationsList.map(conversation => <div key={conversation.id} className="flex items-center gap-2 rounded-3xl border border-[#DCEDE9] bg-[#F8FCFB] p-3 dark:border-slate-700 dark:bg-kit-dark-bg-light"><button disabled={busy} onClick={() => { loadConversation(conversation.id); setRequestError(''); setFailedRequest(null); navigate('chat') }} className="min-w-0 flex-1 p-2 text-left"><span className="block truncate font-bold">{conversation.title || t('conversation')}</span><span className="text-xs text-slate-500">{new Date(conversation.updatedAt).toLocaleDateString(language)}</span></button><button disabled={busy} aria-label={t('deleteConversation', { title: conversation.title || t('conversation') })} onClick={() => deleteConversation(conversation.id)} className="rounded-full p-3 text-slate-500 hover:text-rose-700"><Trash2 size={19} aria-hidden="true" /></button></div>)}</div>}</section>}
              {page === 'guides' && <GuideLibrary />}
              {page === 'settings' && <SimpleSettings local={local} />}
            </div>
          </div>
        </main>
        {page === 'chat' && <div className="kit-composer simple-composer shrink-0">
          {busy && <button onClick={stop} className="kit-text-button mx-auto text-sm"><Square size={14} aria-hidden="true" />{c.stop}</button>}
          <ChatInput key={currentConversationId || 'new'} value={drafts[currentConversationId || 'new'] || ''} onChange={value => setDrafts(previous => ({ ...previous, [currentConversationId || 'new']: value }))} onSend={handleSend} disabled={busy} sendDisabled={!source} placeholder={c.placeholder} />
          {source === 'online' && <p className="px-5 text-center text-xs text-slate-500 dark:text-slate-400">{c.onlinePrivacy}</p>}
          <p className="mx-auto max-w-xl px-5 pb-2 pt-1 text-center text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{c.disclaimer}</p>
        </div>}
      </div>
    </div>
  )
}
