import { createContext, useContext, useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react'
import { generateSmartTitle } from '../utils/dateUtils'
import { emptyHistory, readHistory, writeHistory, removeConversation, limitHistory } from '../utils/chatHistory'

const ChatHistoryContext = createContext()
const MAX_MESSAGE_COUNT = 100
const SAVE_DEBOUNCE_MS = 500

export function ChatHistoryProvider({ children }) {
  const [history, setHistory] = useState(() => readHistory())
  const [storageError, setStorageError] = useState(null)
  const latestHistoryRef = useRef(history)
  const saveTimerRef = useRef(null)
  const { conversations, currentConversationId, conversationOrder } = history

  // Keep teardown and page-hide saves pointed at the latest committed state.
  useLayoutEffect(() => {
    latestHistoryRef.current = history
  }, [history])

  const flushHistory = useCallback(() => {
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = null
    return writeHistory(latestHistoryRef.current)
  }, [])

  useEffect(() => {
    saveTimerRef.current = setTimeout(() => {
      setStorageError(flushHistory())
    }, SAVE_DEBOUNCE_MS)
    return () => clearTimeout(saveTimerRef.current)
  }, [history, flushHistory])

  useEffect(() => {
    const save = () => setStorageError(flushHistory())
    const saveWhenHidden = () => {
      if (document.visibilityState === 'hidden') save()
    }
    window.addEventListener('pagehide', save)
    document.addEventListener('visibilitychange', saveWhenHidden)
    return () => {
      window.removeEventListener('pagehide', save)
      document.removeEventListener('visibilitychange', saveWhenHidden)
      flushHistory()
    }
  }, [flushHistory])

  const createNewConversation = useCallback(() => {
    const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const now = Date.now()
    setHistory(prev => limitHistory({
      conversations: {
        ...prev.conversations,
        [id]: { id, title: null, createdAt: now, updatedAt: now, messages: [] },
      },
      currentConversationId: id,
      // Empty drafts do not consume saved-conversation slots.
      conversationOrder: [id, ...prev.conversationOrder.filter(existingId => prev.conversations[existingId]?.messages.length)],
    }))
    return id
  }, [])

  const loadConversation = useCallback(id => {
    setHistory(prev => Object.hasOwn(prev.conversations, id) ? { ...prev, currentConversationId: id } : prev)
  }, [])

  const deleteConversation = useCallback(id => {
    setHistory(prev => removeConversation(prev, id))
  }, [])

  const updateMessages = useCallback((newMessage, conversationId = null) => {
    const now = Date.now()
    setHistory(prev => {
      const targetId = conversationId || prev.currentConversationId
      const conversation = prev.conversations[targetId]
      if (!conversation) return prev
      const messages = [...conversation.messages, { ...newMessage, timestamp: now }].slice(-MAX_MESSAGE_COUNT)
      return {
        ...prev,
        conversations: {
          ...prev.conversations,
          [targetId]: {
            ...conversation,
            title: conversation.title || (newMessage.role === 'user' ? generateSmartTitle(newMessage.content) : null),
            updatedAt: now,
            messages,
          },
        },
        conversationOrder: [targetId, ...prev.conversationOrder.filter(id => id !== targetId)],
      }
    })
  }, [])

  const clearHistory = useCallback(() => setHistory(emptyHistory()), [])

  const currentMessages = useMemo(() => conversations[currentConversationId]?.messages || [], [currentConversationId, conversations])
  const conversationsList = useMemo(() => conversationOrder.map(id => conversations[id]).filter(conv => conv?.messages.length), [conversationOrder, conversations])
  const value = useMemo(() => ({
    conversations, currentConversationId, conversationOrder, currentMessages, conversationsList,
    createNewConversation, loadConversation, deleteConversation, updateMessages, clearHistory, storageError,
  }), [conversations, currentConversationId, conversationOrder, currentMessages, conversationsList,
    createNewConversation, loadConversation, deleteConversation, updateMessages, clearHistory, storageError])

  return <ChatHistoryContext.Provider value={value}>{children}</ChatHistoryContext.Provider>
}

export function useChatHistory() {
  const context = useContext(ChatHistoryContext)
  if (!context) throw new Error('useChatHistory must be used within a ChatHistoryProvider')
  return context
}
