import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyHistory, readHistory, writeHistory, removeConversation, STORAGE_KEY } from './chatHistory.js'

const conversation = id => ({ id, title: id, messages: [{ role: 'user', content: 'Question', timestamp: 1 }], createdAt: 1, updatedAt: 1 })
const history = () => ({ conversations: { first: conversation('first'), second: conversation('second'), third: conversation('third') }, currentConversationId: 'second', conversationOrder: ['first', 'second', 'third'] })

test('deleting another conversation preserves the selected conversation', () => {
  const result = removeConversation(history(), 'third')
  assert.equal(result.currentConversationId, 'second')
  assert.deepEqual(result.conversationOrder, ['first', 'second'])
})

test('deleting the selected conversation selects a remaining chat, then handles an empty history', () => {
  let result = removeConversation(history(), 'second')
  assert.equal(result.currentConversationId, 'first')
  result = removeConversation(removeConversation(result, 'first'), 'third')
  assert.deepEqual(result, emptyHistory())
})

test('quota errors never erase the last saved chat history', () => {
  const previouslySaved = JSON.stringify(history())
  const storage = {
    getItem: () => previouslySaved,
    setItem: () => { throw Object.assign(new Error('Full'), { name: 'QuotaExceededError' }) },
    removeItem: () => assert.fail('Must not erase saved history'),
  }
  assert.match(writeHistory(emptyHistory(), storage), /could not save/)
  assert.equal(storage.getItem(STORAGE_KEY), previouslySaved)
  assert.deepEqual(readHistory(storage), history())
})

test('history reload survives stale order IDs and malformed stored messages', () => {
  const saved = history()
  saved.conversationOrder = ['missing', 'first', 'first', null]
  saved.conversations.broken = { messages: null }
  saved.conversations.first.messages.push(null, { role: 'assistant', content: 7 })
  const loaded = readHistory({ getItem: () => JSON.stringify(saved) })
  assert.deepEqual(loaded.conversationOrder, ['first', 'second', 'third'])
  assert.equal(loaded.currentConversationId, 'second')
  assert.equal(loaded.conversations.first.messages.length, 1)
})

test('unavailable or malformed browser storage does not prevent chat initialization', () => {
  assert.deepEqual(readHistory({ getItem: () => { throw new Error('Blocked') } }), emptyHistory())
  assert.deepEqual(readHistory({ getItem: () => '{invalid' }), emptyHistory())
})
