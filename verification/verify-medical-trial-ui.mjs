// Real trial component with a deterministic hook fixture. No model is loaded.
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const frontend = path.join(root, 'frontend')
const require = createRequire(path.join(frontend, 'package.json'))
const { build } = require('esbuild')
const postcss = require('postcss')
const tailwind = require('tailwindcss')
const autoprefixer = require('autoprefixer')
const { default: tailwindConfig } = await import(path.join(frontend, 'tailwind.config.js'))
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const artifacts = process.env.KIT_ARTIFACT_DIR || path.join(os.tmpdir(), 'kit-ai-medical-trial-ui')
await fs.mkdir(artifacts, { recursive: true })
const fixture = `
import { useState } from 'react'
window.trialFixture = { prepareCalls: 0, sends: [], stopped: 0 }
export function useMedicalTrial() {
  const [status, setStatus] = useState(new URLSearchParams(location.search).get('state') || 'consent')
  const prepare = () => { window.trialFixture.prepareCalls++; setStatus('ready') }
  const send = async (content, history, onStream, signal) => {
    window.trialFixture.sends.push({ content, history })
    const number = window.trialFixture.sends.length
    onStream?.('Fixture reply ' + number + '…')
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, content.includes('STOP_ME') ? 2500 : 180)
      signal.addEventListener('abort', () => {
        clearTimeout(timer)
        window.trialFixture.stopped++
        setTimeout(() => reject(new DOMException('Stopped', 'AbortError')), 100)
      }, { once: true })
    })
    return 'Fixture reply ' + number + '. Synthetic UI test output only.'
  }
  return {
    status, progress: 37, prepare, retry: prepare, pause: () => setStatus('paused'), send,
    offlineSaved: status === 'ready', modelId: 'synthetic-ui-fixture', downloadGB: 1.83,
    lastFailureStage: null, offlineApp: { status: 'ready', runtimeSaved: true },
    check: {
      supported: true, reason: null, features: { shaderF16: true }, modelCached: true,
      limits: { maxBufferSize: 1073741824, maxStorageBufferBindingSize: 1073741824, maxComputeWorkgroupStorageSize: 32768, maxStorageBuffersPerShaderStage: 10 },
      requestedLimits: { maxBufferSize: 1073741824, maxStorageBufferBindingSize: 1073741824, maxComputeWorkgroupStorageSize: 32768, maxStorageBuffersPerShaderStage: 10 },
      storage: { usageBytes: 123, quotaBytes: 4000000000, availableBytes: 3999999877 },
    },
  }
}
`
const bundled = await build({
  absWorkingDir: frontend,
  stdin: {
    contents: `import React from 'react'; import { createRoot } from 'react-dom/client'; import MedicalModelTrial from './src/components/MedicalModelTrial.jsx'; import { SettingsProvider } from './src/contexts/SettingsContext.jsx'; createRoot(document.getElementById('root')).render(<SettingsProvider><MedicalModelTrial /></SettingsProvider>);`,
    loader: 'jsx', resolveDir: frontend,
  },
  bundle: true, write: false, format: 'esm', jsx: 'automatic', logLevel: 'silent',
  define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'trial-hook-fixture', setup(build) {
    build.onResolve({ filter: /useMedicalTrial$/ }, () => ({ path: 'fixture-hook', namespace: 'fixture' }))
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: fixture, loader: 'js', resolveDir: frontend }))
  } }],
})
const css = await postcss([tailwind({ ...tailwindConfig, content: [path.join(frontend, 'src/**/*.{js,jsx}')] }), autoprefixer]).process(await fs.readFile(path.join(frontend, 'src/index.css'), 'utf8'), { from: path.join(frontend, 'src/index.css') })
const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname
  if (pathname === '/fixture.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(bundled.outputFiles[0].text); return }
  if (pathname === '/fixture.css') { response.setHeader('Content-Type', 'text/css'); response.end(css.css); return }
  if (/^\/fonts\/[a-z0-9-]+\.woff2$/.test(pathname)) {
    try { response.setHeader('Content-Type', 'font/woff2'); response.end(await fs.readFile(path.join(frontend, 'public', pathname))) } catch { response.writeHead(404); response.end() }
    return
  }
  response.setHeader('Content-Type', 'text/html')
  response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}/`
const assert = (value, message) => { if (!value) throw new Error(message) }
const results = []
try {
  for (const engine of ['chromium', 'webkit']) {
    const browser = await (engine === 'chromium' ? chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE_PATH ? { executablePath: process.env.CHROME_EXECUTABLE_PATH } : {}) }) : webkit.launch({ headless: true }))
    try {
      for (const language of ['en', 'es']) for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
        const context = await browser.newContext({ viewport })
        await context.addInitScript(language => {
          localStorage.setItem('kit-ai-language', language)
          Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new DOMException('Denied', 'NotAllowedError') } } })
        }, language)
        const page = await context.newPage()
        const errors = [], externalRequests = []
        page.on('pageerror', error => errors.push(error.message))
        page.on('request', request => { if (!request.url().startsWith(base) && !request.url().startsWith('data:')) externalRequests.push(request.url()) })
        const label = language === 'es' ? { download: 'Descargar prueba · 1,83 GB', cut: '¿Cómo cuido un corte pequeño?', stop: 'Detener respuesta', copied: 'Copiar informe', help: 'Ayuda', newChat: 'Nueva conversación', conversation: 'Conversación de prueba', report: 'Informe para copiar' } : { download: 'Download trial · 1.83 GB', cut: 'How do I care for a small cut?', stop: 'Stop answer', copied: 'Copy report', help: 'Help', newChat: 'New conversation', conversation: 'Trial conversation', report: 'Report to copy' }
        await page.goto(base + '?state=consent')
        const download = page.getByRole('button', { name: label.download, exact: true })
        await download.waitFor()
        assert(await page.evaluate(() => window.trialFixture.prepareCalls === 0 && window.trialFixture.sends.length === 0), 'Download or generation before consent')
        assert(!(await page.locator('body').innerText()).includes('750'), 'Wrong download amount')
        assert(await page.getByRole('link', { name: language === 'es' ? 'Volver a Kit' : 'Back to Kit' }).getAttribute('href') === '/', 'Wrong normal Kit link')
        await page.screenshot({ path: path.join(artifacts, `${engine}-${language}-${viewport.width}-consent.png`), fullPage: true })
        await download.click()
        assert(await page.evaluate(() => window.trialFixture.prepareCalls) === 1, 'Download click not forwarded once')
        await page.getByRole('button', { name: label.cut, exact: true }).click()
        await page.getByText('Fixture reply 1. Synthetic UI test output only.', { exact: true }).waitFor()
        const references = await page.locator('section a[target="_blank"]').evaluateAll(anchors => anchors.map(anchor => anchor.href))
        assert(references.length > 0 && references.every(url => /^https:\/\//.test(url)), 'Missing primary reference links')
        const input = page.locator('#chat-message')
        await input.fill(language === 'es' ? '¿Puedo lavarlo?' : 'Can I wash it?')
        await page.locator('form button[type="submit"]').click()
        await page.getByText('Fixture reply 2. Synthetic UI test output only.', { exact: true }).waitFor()
        assert(await page.evaluate(() => window.trialFixture.sends[1].history.length) === 2, 'Follow-up lost previous exchange')
        assert(await page.evaluate(() => window.trialFixture.sends[1].history[0].role === 'user' && window.trialFixture.sends[1].history[1].role === 'assistant'), 'Wrong history roles')
        const followUpReferences = await page.getByText('Fixture reply 2. Synthetic UI test output only.', { exact: true }).locator('..').locator('a[target="_blank"]').evaluateAll(anchors => anchors.map(anchor => anchor.href))
        assert(followUpReferences.length > 0 && followUpReferences.some(url => references.includes(url)), 'Follow-up lost the cut reference, including Spanish attached pronouns')
        await input.fill('STOP_ME synthetic example')
        await page.locator('form button[type="submit"]').click()
        await page.getByRole('button', { name: label.stop, exact: true }).click()
        await page.getByText(language === 'es' ? 'Se ha detenido la respuesta. Puedes probar otra pregunta.' : 'The answer was stopped. You can try another question.', { exact: true }).waitFor()
        assert(await page.evaluate(() => window.trialFixture.stopped) === 1, 'Stop did not abort generation')
        assert(await page.getByText('STOP_ME synthetic example', { exact: true }).count() === 1, 'Stopped question was discarded')
        assert(!(await page.getByText('Fixture reply 3…', { exact: true }).count()), 'Stopped fragment looked complete')
        await input.fill('SYNTHETIC_PRIVATE_QUESTION_947')
        await page.locator('form button[type="submit"]').click()
        await page.getByText('Fixture reply 4. Synthetic UI test output only.', { exact: true }).waitFor()
        await page.getByText(label.help, { exact: true }).click()
        await page.getByRole('button', { name: label.copied, exact: true }).click()
        const reportText = await page.getByLabel(label.report, { exact: true }).inputValue()
        const report = JSON.parse(reportText)
        assert(!reportText.includes('SYNTHETIC_PRIVATE_QUESTION') && !reportText.includes('Fixture reply') && !reportText.includes('STOP_ME'), 'Report exported conversation text')
        assert(report.runs.length === 4 && report.runs[2].status === 'stopped', 'Run metadata missing')
        assert(report.compatibility.shaderF16 === true && report.compatibility.storage.quotaBytes === 4000000000, 'Support details missing')
        assert(!('browserUserAgent' in report), 'Unrequested browser identity exported')
        await input.scrollIntoViewIfNeeded()
        assert(await input.isVisible() && await input.isEnabled(), 'Composer is not reachable')
        assert(await page.evaluate(() => document.scrollingElement.scrollTop > 0 && document.scrollingElement.scrollHeight > innerHeight), 'Document did not scroll')
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow')
        const inputBox = await input.boundingBox()
        assert(inputBox.y >= 0 && inputBox.y + inputBox.height <= viewport.height, 'Composer clipped after native scroll')
        await page.screenshot({ path: path.join(artifacts, `${engine}-${language}-${viewport.width}-conversation.png`), fullPage: true })
        // The accessible name is the normal Kit logo's localized new-chat label.
        await page.locator('header button').click()
        assert(await page.getByRole('region', { name: label.conversation, exact: true }).count() === 0, 'Logo plus did not reset trial conversation')
        await page.getByRole('button', { name: label.cut, exact: true }).waitFor()
        assert(!errors.length, `Page errors: ${errors.join('; ')}`)
        assert(!externalRequests.length, 'Fixture contacted an external service')
        results.push({ engine, language, viewport, assertions: ['explicit-large-download-consent', 'two-turn-history', 'follow-up-reference-retained', 'stop-drain', 'question-retained', 'logo-reset', 'reference-links', 'clipboard-fallback', 'report-privacy', 'native-scroll', 'no-horizontal-overflow', 'no-external-requests'], pageErrors: errors, externalRequests: externalRequests.length })
        await context.close()
      }
    } finally { await browser.close() }
  }
} finally { await new Promise(resolve => server.close(resolve)) }
const report = { checkedAt: new Date().toISOString(), scope: 'Real MedicalModelTrial component with mocked hook in desktop Chromium and WebKit. Small viewports do not prove physical phone compatibility. No real model, download, GPU inference, offline reopening, or medical accuracy tested.', cases: results.length, results }
await fs.writeFile(path.join(root, 'verification/medical-trial-ui-results.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ result: 'pass', cases: results.length, artifacts }))
