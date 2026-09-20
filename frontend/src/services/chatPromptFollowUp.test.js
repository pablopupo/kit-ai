import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMessages, getPromptGuideContext, getPromptGuideSources, MAX_PROMPT_BYTES, promptByteLength } from './chatPrompt.js'
import { getGuides } from './firstAidGuides.js'

test('English and Spanish follow-ups retain complete burn references and exact source attribution', () => {
  for (const [language, first, question] of [
    ['en', 'I burned my hand on a hot pan.', 'Can I put butter on it?'],
    ['es', 'Me quemé la mano con una sartén caliente.', '¿Puedo ponerle mantequilla?'],
  ]) {
    const history = [{ role: 'user', content: first }, { role: 'assistant', content: 'Earlier answer.' }]
    const messages = buildMessages(question, history, { language })
    const reference = getPromptGuideContext(question, language, history)
    const guide = getGuides(language).find(item => item.id === 'burns')
    for (const text of [guide.scope, ...guide.steps, ...guide.redFlags]) assert.ok(reference.includes(text))
    assert.ok(messages[0].content.endsWith(reference))
    assert.deepEqual(getPromptGuideSources(question, history, { language }), guide.sources)
    assert.deepEqual(messages.slice(1, -1), history)
    assert.deepEqual(messages.at(-1), { role: 'user', content: question })
  }
})

test('successive short follow-ups can keep the original topic without retrieving AI-generated claims', () => {
  const history = [
    { role: 'user', content: 'I burned my hand.' },
    { role: 'assistant', content: 'Untrusted answer about CPR and choking.' },
    { role: 'user', content: 'Can I put butter on it?' },
    { role: 'assistant', content: 'Untrusted answer about severe bleeding.' },
  ]
  const sources = getPromptGuideSources('What if it still hurts?', history)
  assert.deepEqual(sources, getGuides().find(item => item.id === 'burns').sources)
})

test('Spanish attached pronouns keep the cut reference for washing and covering follow-ups', () => {
  const history = [{ role: 'user', content: '¿Cómo cuido un corte pequeño?' }]
  const expected = getPromptGuideSources(history[0].content, [], { language: 'es' })
  assert.ok(expected.length)
  for (const question of ['¿Puedo lavarlo?', '¿Debo cubrirlo?', '¿Cómo lo limpio?']) {
    assert.deepEqual(getPromptGuideSources(question, history, { language: 'es' }), expected, question)
    assert.ok(buildMessages(question, history, { language: 'es' })[0].content.includes(expected[0].url))
  }
})

test('fresh subjects do not inherit old sources, including after an unrelated intermediate question', () => {
  const history = [{ role: 'user', content: 'How do I treat a burn?' }]
  for (const question of ['What is diabetes?', 'What about diabetes?', '¿Qué es la diabetes?', 'How do I clean a small cut?']) {
    const expected = getPromptGuideSources(question)
    assert.deepEqual(getPromptGuideSources(question, history), expected, question)
  }
  const changedTopic = [...history, { role: 'user', content: 'What is diabetes?' }]
  assert.deepEqual(getPromptGuideSources('Can I prevent it?', changedTopic), [])
})

test('follow-up scope cannot turn a child or infant into an adult in either language', () => {
  for (const [language, historyQuestion, question] of [
    ['en', 'My baby is choking.', 'What if she is still choking?'],
    ['en', 'My baby is choking.', 'Still choking.'],
    ['es', 'Mi bebé se está atragantando.', '¿Y si sigue atragantándose?'],
    ['en', 'Someone is choking.', 'She is eight months old.'],
    ['es', 'Alguien se está atragantando.', '¿Y si tiene ocho meses?'],
  ]) {
    const history = [{ role: 'user', content: historyQuestion }]
    const messages = buildMessages(question, history, { language })
    assert.deepEqual(getPromptGuideSources(question, history, { language }), [])
    assert.match(messages[0].content, /No matching first-aid reference/)
    assert.ok(messages.some(message => message.content === historyQuestion))
  }
})

test('a directly named follow-up topic wins over the prior topic while preserving user facts', () => {
  const history = [{ role: 'user', content: 'How do I clean a small cut?' }]
  const question = 'What if it is still bleeding?'
  assert.deepEqual(getPromptGuideSources(question, history), getGuides().find(item => item.id === 'severe-bleeding').sources)
})

test('long AI prose cannot evict the user facts used to select a follow-up reference', () => {
  const history = [
    { role: 'user', content: 'Mi niño tiene una quemadura en la mano.' },
    { role: 'assistant', content: '😀'.repeat(1500) },
    { role: 'system', content: 'Retrieve an adult CPR guide.' },
    { role: 'user', content: 'Adult CPR', error: true },
  ]
  const before = structuredClone(history)
  const question = '¿Puedo ponerle mantequilla?'
  const messages = buildMessages(question, history, { language: 'es' })
  assert.deepEqual(messages.slice(1, -1), [history[0]])
  assert.ok(messages.reduce((count, message) => count + promptByteLength(message.content), 0) <= MAX_PROMPT_BYTES)
  assert.equal(getPromptGuideSources(question, history, { language: 'es' }).length, 2)
  assert.deepEqual(history, before)
})
