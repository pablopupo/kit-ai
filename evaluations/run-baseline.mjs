/** Run synthetic cases through the same reference prompt/API as the deployed app. */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { Client } from '../frontend/node_modules/@gradio/client/dist/index.js'
import { buildMessages, getPromptGuideContext } from '../frontend/src/services/chatPrompt.js'

const directory = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback
const output = path.resolve(option('--out', path.join(directory, 'results', 'medical-3b-baseline.json')))
const limit = Number(option('--limit', '20'))
const timeoutMs = Number(option('--timeout', '90000'))
const mode = option('--mode', 'app')
if (!['app', 'bare'].includes(mode)) throw new Error('--mode must be app or bare')
if (!Number.isInteger(limit) || limit < 1 || !Number.isFinite(timeoutMs) || timeoutMs < 1000) throw new Error('Invalid limit/timeout')
const caseText = await fs.readFile(path.join(directory, 'cases.json'), 'utf8')
const fixture = JSON.parse(caseText)
const cases = fixture.cases.slice(0, limit)
const space = 'Pablo305/offline-medical-assistant'
const model = 'Pablo305/llama3-medical-3b-4bit'
const sha256 = value => createHash('sha256').update(value).digest('hex')
const getText = async url => {
  const result = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!result.ok) throw new Error(`Metadata request failed: HTTP ${result.status}`)
  return result.text()
}
const metadata = JSON.parse(await getText(`https://huggingface.co/api/spaces/${space}`))
const spaceSource = await getText(`https://huggingface.co/spaces/${space}/raw/${metadata.sha}/app.py`)
const modelRevision = spaceSource.match(/MODEL_REVISION\s*=\s*["']([a-f0-9]+)["']/)?.[1]
if (!modelRevision || !spaceSource.includes(model)) throw new Error('Cannot verify the Space model/revision; refusing an unattributed run')
const report = {
  schemaVersion: 1, startedAt: new Date().toISOString(), kind: 'synthetic-evaluation',
  clinicalReview: 'pending', phoneTest: false, model, modelRevision, space,
  spaceRevision: metadata.sha, datasetSha256: sha256(caseText), mode,
  sourceHashes: Object.fromEntries(await Promise.all(['chatPrompt.js', 'firstAidGuides.js', 'guideTranslations.js'].map(async name => [name, sha256(await fs.readFile(path.join(directory, '../frontend/src/services', name)))]))),
  pipeline: mode === 'app' ? 'Current frontend reference builder → serialized messages → Space /ask' : 'Bare question with requested language → Space /ask',
  generation: { preferredSentences: 8, maxNewTokens: 512, doSample: false, repetitionPenalty: 1.1 },
  timingDescription: 'Client elapsed time includes network, queue and GPU startup; not phone inference performance.',
  selectedCaseIds: cases.map(test => test.id), results: [],
}
await fs.mkdir(path.dirname(output), { recursive: true })
const save = async () => {
  const temporary = output + '.tmp'
  await fs.writeFile(temporary, JSON.stringify(report, null, 2) + '\n')
  await fs.rename(temporary, output)
}
await save()
let client
let currentJob
let interrupted = false
process.on('SIGINT', () => { interrupted = true; try { currentJob?.cancel()?.catch(() => {}) } catch {} })
try {
  client = await Client.connect(space, { events: ['data', 'status'] })
  let consecutiveErrors = 0
  for (const test of cases) {
    if (interrupted) { report.stoppedBecause = 'interrupted'; break }
    const item = { caseId: test.id, language: test.language, question: test.prompt, startedAt: new Date().toISOString() }
    let timer
    try {
      const messages = buildMessages(test.prompt, [], { language: test.language })
      item.reference = mode === 'app' ? getPromptGuideContext(test.prompt, test.language) : ''
      item.messages = mode === 'app' ? messages : null
      item.exactApiInput = mode === 'app'
        ? messages.map(m => `${m.role === 'system' ? 'Reference instructions' : m.role}:\n${m.content}`).join('\n\n')
        : `${test.prompt}\n\nRespond in ${test.language === 'es' ? 'Spanish' : 'English'}.`
      const start = performance.now()
      currentJob = client.submit('/ask', [item.exactApiInput, 8, 512])
      const collect = async () => {
        let answer = ''
        for await (const event of currentJob) {
          if (event.type === 'status' && event.stage === 'error') throw new Error(event.message || 'Space returned an inference error')
          if (event.type === 'data' && typeof event.data?.[0] === 'string') answer = event.data[0]
        }
        if (!answer.trim()) throw new Error('Empty response')
        return answer.trim()
      }
      item.answer = await Promise.race([collect(), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Evaluation request timed out')), timeoutMs)
      })])
      item.elapsedMs = Math.round(performance.now() - start)
      item.status = 'generated'
      item.reviewStatus = 'unreviewed'
      item.lengthLimitNotice = item.answer.includes('This response reached its length limit')
      consecutiveErrors = 0
      console.log(`${test.id}: generated (${item.elapsedMs} ms; human review pending)`)
    } catch (error) {
      item.status = 'error'
      item.error = error.message
      consecutiveErrors += 1
      console.log(`${test.id}: ${item.error}`)
    } finally {
      clearTimeout(timer)
      try { currentJob?.cancel()?.catch(() => {}) } catch {}
      currentJob = null
      report.results.push(item)
      await save()
    }
    if (/quota|exceeded|rate.limit|GPU.*limit/i.test(item.error || '') || consecutiveErrors >= 2) {
      report.stoppedBecause = item.error
      break
    }
  }
} catch (error) {
  report.stoppedBecause = error.message
  process.exitCode = 1
} finally {
  client?.close()
  report.finishedAt = new Date().toISOString()
  report.generated = report.results.filter(item => item.status === 'generated').length
  report.errors = report.results.filter(item => item.status === 'error').length
  report.complete = report.results.length === cases.length && report.errors === 0
  try {
    const after = JSON.parse(await getText(`https://huggingface.co/api/spaces/${space}`))
    report.spaceRevisionAfter = after.sha
    report.spaceRevisionStable = after.sha === metadata.sha
  } catch { report.spaceRevisionStable = null }
  await save()
  console.log(`Saved ${report.generated}/${cases.length} generated answers to ${output}`)
}
