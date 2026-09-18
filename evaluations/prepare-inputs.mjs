import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { buildMessages, getPromptGuideContext } from '../frontend/src/services/chatPrompt.js'

const directory = path.dirname(fileURLToPath(import.meta.url))
const output = process.argv[2]
if (!output) throw new Error('Usage: node evaluations/prepare-inputs.mjs output.json')
const hash = value => createHash('sha256').update(value).digest('hex')
const source = await fs.readFile(path.join(directory, 'cases.json'), 'utf8')
const fixture = JSON.parse(source)
const report = {
  schemaVersion: 1, createdAt: new Date().toISOString(), datasetSha256: hash(source),
  sourceHashes: Object.fromEntries(await Promise.all(['chatPrompt.js', 'firstAidGuides.js', 'guideTranslations.js'].map(async name => [name, hash(await fs.readFile(path.join(directory, '../frontend/src/services', name)))]))),
  cases: fixture.cases.map(test => {
    const messages = buildMessages(test.prompt, [], { language: test.language })
    return { ...test, messages, reference: getPromptGuideContext(test.prompt, test.language),
      exactApiInput: messages.map(m => `${m.role === 'system' ? 'Reference instructions' : m.role}:\n${m.content}`).join('\n\n') }
  }),
}
await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true })
await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n')
console.log(`Frozen ${report.cases.length} inputs: ${report.datasetSha256}`)
