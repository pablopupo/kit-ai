export const STORAGE_KEY = 'kit-ai-chat-history'
const MAX_CONVERSATIONS = 50

export const emptyHistory = () => ({ conversations: {}, currentConversationId: null, conversationOrder: [] })

export function limitHistory(history) {
  const conversationOrder = [...new Set(history.conversationOrder)]
    .filter(id => Object.hasOwn(history.conversations, id))
    .slice(0, MAX_CONVERSATIONS)
  return {
    conversations: Object.fromEntries(conversationOrder.map(id => [id, history.conversations[id]])),
    currentConversationId: conversationOrder.includes(history.currentConversationId) ? history.currentConversationId : null,
    conversationOrder,
  }
}

export function readHistory(storage) {
  try {
    const targetStorage = storage ?? globalThis.localStorage
    const parsed = JSON.parse(targetStorage?.getItem(STORAGE_KEY) || 'null')
    if (!parsed || typeof parsed.conversations !== 'object' || !parsed.conversations) return emptyHistory()
    const conversations = Object.fromEntries(Object.entries(parsed.conversations).flatMap(([id, conversation]) => {
      if (!conversation || !Array.isArray(conversation.messages)) return []
      const messages = conversation.messages.filter(message => message && ['user', 'assistant'].includes(message.role) && typeof message.content === 'string')
        .slice(-100).map(message => ({ ...message, timestamp: Number.isFinite(message.timestamp) ? message.timestamp : 0 }))
      return [[id, {
        id, title: typeof conversation.title === 'string' ? conversation.title : null,
        createdAt: Number.isFinite(conversation.createdAt) ? conversation.createdAt : 0,
        updatedAt: Number.isFinite(conversation.updatedAt) ? conversation.updatedAt : 0,
        messages,
      }]]
    }))
    const storedOrder = Array.isArray(parsed.conversationOrder) ? parsed.conversationOrder.filter(id => typeof id === 'string') : []
    return limitHistory({
      conversations,
      currentConversationId: typeof parsed.currentConversationId === 'string' ? parsed.currentConversationId : null,
      conversationOrder: [...storedOrder, ...Object.keys(conversations).sort((a, b) => conversations[b].updatedAt - conversations[a].updatedAt)],
    })
  } catch {
    return emptyHistory()
  }
}

export function writeHistory(history, storage) {
  try {
    const targetStorage = storage ?? globalThis.localStorage
    if (!targetStorage) throw new Error('Storage is unavailable')
    targetStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...limitHistory(history) }))
    return null
  } catch {
    // A failed save must never delete the last successfully saved conversations.
    return 'This browser could not save your latest chats. Keep this page open to retain them.'
  }
}

export function removeConversation(history, id) {
  const conversations = { ...history.conversations }
  delete conversations[id]
  const conversationOrder = history.conversationOrder.filter(existingId => existingId !== id)
  return {
    conversations,
    conversationOrder,
    currentConversationId: history.currentConversationId === id ? (conversationOrder[0] || null) : history.currentConversationId,
  }
}
