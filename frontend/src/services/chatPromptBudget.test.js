import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMessages, getPromptGuideContext, MAX_PROMPT_BYTES, promptByteLength, PromptValidationError } from './chatPrompt.js'
import { getGuides } from './firstAidGuides.js'

test('UTF-8 prompt budget bounds multibyte history while keeping a complete question', () => {
  const history = [
    { role: 'user', content: '😀🩹💊🤕🩺'.repeat(65) },
    { role: 'assistant', content: '🦠😷💉🏥🔥'.repeat(65) },
    { role: 'user', content: '¿Y si todavía duele?' },
    { role: 'assistant', content: 'Comprueba los signos de alarma.' },
  ]
  const question = '¿Cómo cuidar una quemadura leve?'
  const messages = buildMessages(question, history, { language: 'es' })
  assert.ok(messages.reduce((bytes, message) => bytes + promptByteLength(message.content), 0) <= MAX_PROMPT_BYTES)
  assert.deepEqual(messages.at(-1), { role: 'user', content: question })
  assert.deepEqual(messages.slice(1, -1), history.slice(-2))
  const guide = getGuides('es').find(item => item.id === 'burns')
  for (const text of [...guide.steps, ...guide.redFlags, guide.sources[0].url]) assert.ok(messages[0].content.includes(text))
})

test('oversized byte input is rejected without silently cutting the final qualifier', () => {
  const question = '😀🩹💊🤕🩺'.repeat(115) + ' La persona es un bebé.'
  assert.ok(question.length <= 1200)
  assert.throws(() => buildMessages(question, [], { language: 'es' }), error => (
    error instanceof PromptValidationError && error.message.includes('Acorta la pregunta')
  ))
})

test('source attribution exposes precisely the whole guides included in the prompt', () => {
  for (const language of ['en', 'es']) {
    const question = 'Burn, cut, bleeding, choking and CPR'
    const reference = getPromptGuideContext(question, language)
    const [system] = buildMessages(question, [], { language })
    assert.ok(reference)
    assert.ok(system.content.endsWith(reference))
    assert.ok(promptByteLength(system.content + question) <= MAX_PROMPT_BYTES)
    for (const guide of getGuides(language)) {
      if (reference.includes(guide.sources[0].url)) {
        for (const text of [...guide.steps, ...guide.redFlags]) assert.ok(reference.includes(text))
      }
    }
  }
})
