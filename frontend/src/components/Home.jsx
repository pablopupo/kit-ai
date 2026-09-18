import { useState, useRef, useEffect } from 'react'
import { BookOpen, MessageCircle, History, Settings, Plus, WifiOff, ArrowUpRight, Download, Square, Trash2, ShieldCheck } from 'lucide-react'
import ChatInput from './ChatInput'
import ChatMessage from './ChatMessage'
import GuideLibrary from './GuideLibrary'
import { useWebLLM } from '../hooks/useWebLLM'
import { useSettings } from '../contexts/SettingsContext'
import { useTTS } from '../contexts/TTSContext'
import { useChatHistory } from '../contexts/ChatHistoryContext'
import { askMedicalModel, MEDICAL_MODEL } from '../services/onlineMedicalService'
import { searchGuides, getGuideContext } from '../services/firstAidGuides'

const tabs = [
  { id: 'guides', title: 'Guides', icon: BookOpen },
  { id: 'chat', title: 'Ask Kit', icon: MessageCircle },
  { id: 'history', title: 'History', icon: History },
  { id: 'settings', title: 'Settings', icon: Settings },
]

export default function Home() {
  const [tab, setTab] = useState('guides')
  const [mode, setMode] = useState('online')
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
  const { darkMode, setDarkMode } = useSettings()
  const { ttsEnabled, setTtsEnabled, speed, setSpeed } = useTTS()
  const { currentMessages, conversationsList, createNewConversation, loadConversation, deleteConversation, updateMessages, currentConversationId, storageError } = useChatHistory()

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
  const newChat = () => { stop(); createNewConversation(); setRequestError(''); setTab('chat') }
  const handleSend = async content => {
    if (abortRef.current) return
    const controller = new AbortController()
    abortRef.current = controller
    const convId = currentConversationId || createNewConversation()
    const priorMessages = currentMessages
    updateMessages({ role: 'user', content }, convId)
    setPendingConversation(convId)
    setBusy(true)
    setStreaming('')
    setRequestError('')
    setRequestStatus(mode === 'online' ? 'Connecting to the medical model…' : 'Thinking on this device…')
    try {
      const answer = mode === 'online'
        ? await askMedicalModel(content, priorMessages, { signal: controller.signal, onStatus: setRequestStatus })
        : await local.sendMessage(content, priorMessages, setStreaming, controller.signal)
      const reference = getGuideContext(content, 3000)
      if (!controller.signal.aborted) updateMessages({ role: 'assistant', content: answer, model: mode === 'online' ? MEDICAL_MODEL : 'Local general-purpose model', sources: searchGuides(content).flatMap(guide => guide.sources).filter(source => reference.includes(source.url)) }, convId)
    } catch (err) {
      if (!controller.signal.aborted && err.name !== 'AbortError') setRequestError(err.message || 'The model is unavailable. You can still use first-aid guides.')
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
        setStreaming('')
        setBusy(false)
        setPendingConversation(null)
      }
    }
  }
  const ready = mode === 'online' ? online : local.status === 'ready'
  const sameConversation = pendingConversation === currentConversationId

  return (
    <div className="app-shell flex bg-white dark:bg-kit-dark-bg text-slate-800 dark:text-kit-dark-text overflow-hidden">
      <aside className="hidden md:flex w-60 shrink-0 flex-col bg-[#E0F5F3] dark:bg-kit-dark-bg-light p-6 border-r border-teal-100 dark:border-slate-700">
        <button onClick={() => setTab('guides')} aria-label="Kit AI home" className="text-4xl font-extrabold tracking-tight text-[#B83F4B] dark:text-kit-red text-left mb-3">kit<span className="text-teal-800 dark:text-teal-300">.ai</span></button>
        <p className="text-sm text-teal-900 dark:text-slate-300 mb-10">A little clarity.<br />When it matters.</p>
        <nav aria-label="Main navigation" className="space-y-2">
          {tabs.map(({ id, title, icon: Icon }) => <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined} className={`flex w-full gap-3 items-center min-h-12 px-4 rounded-xl font-bold ${tab === id ? 'bg-white dark:bg-kit-dark-bg text-teal-900 dark:text-teal-200' : 'text-slate-600 dark:text-slate-300 hover:bg-white/50'}`}><Icon size={20} />{title}</button>)}
        </nav>
        <button onClick={newChat} disabled={busy} className="kit-text-button mt-6"><Plus size={18} /> New conversation</button>
        <div className="mt-auto text-sm text-teal-900 dark:text-teal-200 pt-8"><ShieldCheck size={21} className="mb-2" /><p className="font-bold">{offlineReady ? 'Guides saved for offline' : 'First-aid guides included'}</p><p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">General information, not a diagnosis. In an emergency, call your local emergency number.</p></div>
      </aside>
      <div className="flex-1 min-w-0 flex flex-col">
        <header style={{ paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))' }} className="flex shrink-0 items-center justify-between px-5 md:px-10 py-4 border-b border-slate-100 dark:border-slate-800 gap-3">
          <span className="md:hidden text-2xl font-extrabold text-[#B83F4B] dark:text-kit-red">kit.ai</span>
          <span className="hidden md:block font-bold">{tabs.find(item => item.id === tab)?.title}</span>
          <span className="text-xs text-slate-600 dark:text-slate-300 flex gap-2 items-center">{!online && <WifiOff size={15} />}{!online ? 'Offline' : offlineReady ? 'Guides available offline' : 'First-aid companion'}</span>
        </header>
        <div className="shrink-0 px-5 md:px-10 py-2.5 bg-rose-50 dark:bg-rose-950/20 text-[#87343B] dark:text-rose-200 text-xs sm:text-sm">Immediate danger? Call your local emergency number. Don’t wait for AI.</div>
        {storageError && <p role="status" className="px-5 py-2 text-amber-800 bg-amber-50 text-sm">{storageError}</p>}
        <main ref={mainRef} id="main-content" className="flex-1 overflow-y-auto min-h-0 px-5 md:px-10 py-7 md:py-10">
          <div className="max-w-3xl mx-auto">
            {tab === 'guides' && <GuideLibrary />}
            {tab === 'chat' && <>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h1 className="text-2xl font-extrabold">Ask Kit</h1>
                <button onClick={newChat} disabled={busy} className="kit-text-button"><Plus size={17} /> New chat</button>
              </div>
              <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="AI mode">
                <button disabled={busy} aria-pressed={mode === 'online'} onClick={() => { setMode('online'); setRequestError('') }} className={`kit-mode ${mode === 'online' ? 'selected' : ''}`}>Online medical model</button>
                <button disabled={busy} aria-pressed={mode === 'local'} onClick={() => { setMode('local'); setRequestError('') }} className={`kit-mode ${mode === 'local' ? 'selected' : ''}`}>Local AI</button>
              </div>
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400 mb-6">{mode === 'online' ? <>Uses <a href={`https://huggingface.co/${MEDICAL_MODEL}`} target="_blank" rel="noreferrer" className="underline">your fine-tuned Llama 3.2 3B</a>. Sending a message shares it and recent conversation with Hugging Face. Avoid identifying details. The model is experimental; answers can be wrong.</> : `Runs on your device after a large download. ${import.meta.env.VITE_WEBLLM_MODEL_URL ? 'Custom MLC model configured.' : 'Uses general-purpose Llama 3.2 1B; this is not the fine-tuned medical model.'}`}</p>
              {mode === 'local' && local.status !== 'ready' && <div className="rounded-xl border border-teal-200 dark:border-slate-700 p-5 mb-6">
                <p className="text-sm mb-3">Local AI needs a compatible browser and enough memory. Use Wi-Fi for the initial model download (about 1 GB). Guides need no model.</p>
                {local.error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300 mb-3">{local.error.message}</p>}
                <button className="kit-primary" onClick={local.loadEngine} disabled={local.status === 'loading'}><Download size={17} />{local.status === 'loading' ? `Downloading… ${Math.round(local.progress)}%` : 'Download local AI'}</button>
                {local.status === 'loading' && <progress aria-label="Model download" max="100" value={local.progress} className="w-full mt-4" />}
              </div>}
              {mode === 'online' && !online && <p role="status" className="text-sm mb-5">Reconnect to use online AI. Your first-aid guides are still here.</p>}
              {currentMessages.length === 0 && <div className="py-7 border-t border-slate-200 dark:border-slate-700">
                <h2 className="text-xl font-bold mb-3">What would you like to understand?</h2>
                <p className="text-slate-600 dark:text-slate-300 mb-5">Ask a general health question, or start with a first-aid topic.</p>
                <div className="flex flex-wrap gap-2">{['How do I care for a small cut?', 'What should I do for a minor burn?'].map(question => <button key={question} disabled={!ready || busy} onClick={() => handleSend(question)} className="kit-mode text-left">{question}</button>)}</div>
              </div>}
              <div role="log" aria-label="Conversation" aria-live="polite">
                {currentMessages.map((message, index) => <div key={`${message.timestamp}-${index}`}><ChatMessage role={message.role} content={message.content} />{message.role === 'assistant' && <p className="text-xs text-slate-500 mb-5 ml-12">{message.model || 'Previous conversation'}{message.sources?.length > 0 && <> · Reference material: {[...new Map(message.sources.map(source => [source.url, source])).values()].map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="underline mr-2">{source.title}</a>)}</>}</p>}</div>)}
                {busy && sameConversation && (streaming ? <ChatMessage role="assistant" content={streaming} /> : <p role="status" className="py-5 text-sm text-teal-800 dark:text-teal-200">{requestStatus}</p>)}
              </div>
              {requestError && <div role="alert" className="my-4 border-l-4 border-rose-400 p-4 bg-rose-50 dark:bg-rose-950/20 text-sm"><p>{requestError}</p><button onClick={() => setTab('guides')} className="kit-text-button mt-3">Open first-aid guides</button></div>}
              <div ref={endRef} />
            </>}
            {tab === 'history' && <section><h1 className="text-3xl font-extrabold mb-3">Your conversations</h1><p className="text-slate-600 dark:text-slate-400 mb-7">Saved in this browser. Delete a conversation to remove it from this device.</p>{conversationsList.length === 0 ? <p>No conversations yet. <button onClick={() => setTab('chat')} className="underline text-teal-800 dark:text-teal-300">Ask Kit a question</button>.</p> : <div className="divide-y divide-slate-200 dark:divide-slate-700">{conversationsList.map(conversation => <div key={conversation.id} className="flex gap-3 items-center py-3"><button disabled={busy} onClick={() => { loadConversation(conversation.id); setRequestError(''); setTab('chat') }} className="flex-1 text-left p-2 min-w-0"><span className="block font-bold truncate">{conversation.title || 'Conversation'}</span><span className="text-xs text-slate-500">{new Date(conversation.updatedAt).toLocaleDateString()}</span></button><button disabled={busy} aria-label={`Delete ${conversation.title || 'conversation'}`} onClick={() => deleteConversation(conversation.id)} className="p-3 text-slate-500 hover:text-rose-700"><Trash2 size={19} /></button></div>)}</div>}</section>}
            {tab === 'settings' && <section className="max-w-xl"><h1 className="text-3xl font-extrabold mb-8">Make yourself comfortable.</h1><div className="divide-y divide-slate-200 dark:divide-slate-700">
              <label className="flex gap-4 items-center justify-between py-5"><span><span className="block font-bold">Dark appearance</span><span className="text-sm text-slate-500">A softer screen in low light.</span></span><input type="checkbox" className="w-6 h-6 accent-teal-700" checked={darkMode} onChange={e => setDarkMode(e.target.checked)} /></label>
              <label className="flex gap-4 items-center justify-between py-5"><span><span className="block font-bold">Read answers aloud</span><span className="text-sm text-slate-500">Use the play button under an answer.</span></span><input type="checkbox" className="w-6 h-6 accent-teal-700" checked={ttsEnabled} onChange={e => setTtsEnabled(e.target.checked)} /></label>
              <label className="block py-5"><span className="font-bold">Voice speed: {speed}×</span><input aria-label="Voice speed" type="range" min="0.5" max="2" step="0.1" value={speed} onChange={e => setSpeed(Number(e.target.value))} className="block w-full mt-4 accent-teal-700" /></label>
              <div className="py-5"><h2 className="font-bold mb-2">Take Kit with you</h2><p className="text-sm text-slate-600 dark:text-slate-300">On iPhone, open in Safari and choose Share → Add to Home Screen. On Android, use your browser’s Install app or Add to Home Screen option. Open Kit once online and let it finish loading before you go offline.</p></div>
              <div className="py-5"><h2 className="font-bold mb-2">About these guides</h2><p className="text-sm text-slate-600 dark:text-slate-300">Six English-language summaries linked to public first-aid sources. They are not a diagnosis or a substitute for professional care. AI answers have not been clinically validated.</p><a href="https://github.com/pablopupo/kit-ai" target="_blank" rel="noreferrer" className="kit-text-button mt-4">View the project <ArrowUpRight size={16} /></a></div>
            </div></section>}
          </div>
        </main>
        {tab === 'chat' && <div className="shrink-0 border-t border-slate-100 dark:border-slate-800">{busy && <button onClick={stop} className="kit-text-button mx-auto mt-2 text-sm"><Square size={14} /> Stop response</button>}<ChatInput onSend={handleSend} disabled={busy || !ready} placeholder={!ready ? mode === 'online' ? 'Connect to the internet for online AI' : 'Download local AI to chat' : 'Ask a general health question…'} /></div>}
        <nav aria-label="Mobile navigation" className="md:hidden shrink-0 flex border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-kit-dark-bg" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>{tabs.map(({ id, title, icon: Icon }) => <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined} className={`flex-1 min-h-16 flex flex-col items-center justify-center gap-1 text-xs font-bold ${tab === id ? 'text-teal-800 dark:text-teal-200 bg-teal-50 dark:bg-teal-950/30' : 'text-slate-500 dark:text-slate-400'}`}><Icon size={21} />{title}</button>)}</nav>
      </div>
    </div>
  )
}
