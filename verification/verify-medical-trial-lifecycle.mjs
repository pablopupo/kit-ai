// Runs the real React hook in StrictMode, with deterministic dependency fakes.
// This checks application lifecycle/consent only. It does not run a model, prove
// physical-phone support, or evaluate the accuracy of any generated answer.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(repo, 'frontend/package.json'))
const { build } = require('esbuild')
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const modelId = 'kit-medical-3b-synthetic-published-revision'
const consentKey = `kit-ai-trial-download-approved:${modelId}`
const mocks = {
  SettingsContext: `export const useSettings = () => ({language: window.__scenario.language || 'en'})`,
  useOfflineApp: `export const useOfflineApp = () => window.__snapshot`,
  medicalTrialConfig: `
    export const MEDICAL_TRIAL_MODEL_ID = ${JSON.stringify(modelId)};
    export const MEDICAL_TRIAL_CONSENT_KEY = ${JSON.stringify(consentKey)};
    export const MEDICAL_TRIAL_DOWNLOAD_GB = 1.83;
    export const MEDICAL_TRIAL_RECORD = window.__scenario.published === false ? null : {model:'https://model.invalid/pinned-revision/',model_id:MEDICAL_TRIAL_MODEL_ID,model_lib:'https://model.invalid/pinned-revision/model.wasm',required_features:['shader-f16']};`,
  modelTrialCheck: `export const checkMedicalModelTrial = async options => {
    window.__calls.preflight.push(options);
    if (window.__scenario.preflightDeferred && window.__calls.preflight.length === 1) await new Promise(resolve => window.__resolvePreflight = resolve);
    return {supported: window.__scenario.supported !== false, reason: window.__scenario.supported === false ? 'storage-binding-limit' : null};
  }`,
  offlineAppService: `
    export const getOfflineAppSnapshot = () => window.__snapshot;
    export const checkOfflineApp = async () => { window.__calls.appChecks++; return window.__snapshot; };
    export const retryOfflineSave = async () => { window.__calls.appSaves++; window.__snapshot.status='ready'; };
    export const ensureOfflineRuntime = async signal => { window.__calls.runtimeSaves++; if(signal.aborted) throw new DOMException('Stopped','AbortError'); window.__snapshot.runtimeSaved=true; };`,
  webllmService: `
    window.__calls.serviceImports++;
    export const isModelCached = async (id,record) => { window.__calls.cacheChecks.push({id,record}); return window.__cached; };
    export const initEngine = async (id,onProgress,signal,record) => {
      window.__calls.init.push({id,record});
      onProgress({progress:45});
      if(window.__scenario.initDeferred) await new Promise((resolve,reject) => window.__pendingInit.push({resolve,reject,signal}));
      window.__cached=true;
      onProgress({progress:100});
    };
    export const generateReply = async (messages,options) => {window.__calls.generate.push({messages,expectedModelId:options.expectedModelId,language:options.language}); return 'Synthetic local fixture reply';};`,
}
const bundle = await build({
  stdin: {
    contents: `import React,{useEffect} from 'react'; import {createRoot} from 'react-dom/client'; import {useMedicalTrial} from './src/hooks/useMedicalTrial.js';
      function Harness(){const trial=useMedicalTrial();window.__trial=trial;useEffect(()=>{window.__states.push(trial.status)},[trial.status]);return React.createElement('div',{'data-status':trial.status},trial.status)}
      window.__mount=()=>{window.__root=createRoot(document.getElementById('app'));window.__root.render(React.createElement(React.StrictMode,null,React.createElement(Harness)))};window.__mount();`,
    resolveDir: path.join(repo, 'frontend'), loader: 'jsx',
  },
  bundle: true, write: false, format: 'iife', platform: 'browser',
  define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'trial-fixture-dependencies', setup(builder) {
    builder.onResolve({ filter: /(?:SettingsContext|useOfflineApp|medicalTrialConfig|modelTrialCheck|offlineAppService|webllmService)(?:\.js)?$/ }, args => {
      const name = path.basename(args.path).replace(/\.js$/, '')
      return name in mocks ? { path: name, namespace: 'trial-fixture' } : undefined
    })
    builder.onLoad({ filter: /.*/, namespace: 'trial-fixture' }, args => ({ contents: mocks[args.path], loader: 'js' }))
    builder.onResolve({ filter: /onlineMedicalService/ }, () => { throw Error('Trial must not import an online provider') })
  } }],
})
const server = http.createServer((request, response) => {
  response.setHeader('Content-Type', request.url === '/bundle.js' ? 'text/javascript' : 'text/html')
  response.end(request.url === '/bundle.js' ? bundle.outputFiles[0].text : '<!doctype html><div id="app"></div><script src="/bundle.js"></script>')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const url = `http://127.0.0.1:${server.address().port}/?trial=medical3b`
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE_PATH ? { executablePath: process.env.CHROME_EXECUTABLE_PATH } : {}) })
const results = []
async function fixture(name, scenario, exercise) {
  const context = await browser.newContext()
  const errors = [], externalRequests = []
  await context.addInitScript(({ scenario, consentKey }) => {
    window.__scenario = scenario
    window.__cached = scenario.cached === true
    window.__online = scenario.online !== false
    window.__snapshot = { status: 'ready', runtimeSaved: true }
    window.__states = []
    window.__pendingInit = []
    window.__calls = { preflight: [], serviceImports: 0, runtimeSaves: 0, appSaves: 0, appChecks: 0, init: [], cacheChecks: [], generate: [], persist: 0 }
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => window.__online })
    Object.defineProperty(navigator, 'storage', { configurable: true, value: { persist: async () => { window.__calls.persist++; return false } } })
    if (scenario.approved) localStorage.setItem(consentKey, 'true')
    if (scenario.legacyApproved) localStorage.setItem('kit-ai-offline-download-approved', 'true')
    if (scenario.previousTrialApproved) localStorage.setItem('kit-ai-trial-download-approved:kit-medical-3b-previous-revision', 'true')
  }, { scenario, consentKey })
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => { if (!request.url().startsWith(url.split('?')[0])) externalRequests.push(request.url()) })
  try {
    await page.goto(url)
    await exercise(page)
    assert.deepEqual(errors, [], 'Unexpected browser errors')
    assert.deepEqual(externalRequests, [], 'The fixture must never download model assets')
    const evidence = await page.evaluate(() => ({ states: window.__states, calls: window.__calls, offlineSaved: window.__trial.offlineSaved }))
    results.push({ name, result: 'pass', evidence })
  } finally { await context.close() }
}
const status = (page, expected) => page.waitForFunction(value => window.__trial?.status === value, expected)
const counts = page => page.evaluate(() => ({ runtime: window.__calls.runtimeSaves, imports: window.__calls.serviceImports, init: window.__calls.init.length }))
try {
  await fixture('Legacy 750 MB approval does not approve the larger medical model', { legacyApproved: true }, async page => {
    await status(page, 'consent')
    assert.deepEqual(await counts(page), { runtime: 0, imports: 0, init: 0 })
    assert.equal(await page.evaluate(key => localStorage.getItem(key), consentKey), null)
  })
  await fixture('Approval for a previous medical model revision does not approve this one', { previousTrialApproved: true }, async page => {
    await status(page, 'consent')
    assert.deepEqual(await counts(page), { runtime: 0, imports: 0, init: 0 })
    assert.equal(await page.evaluate(key => localStorage.getItem(key), consentKey), null)
  })
  await fixture('Incompatible phone stops before runtime or model imports', { supported: false }, async page => {
    await status(page, 'unsupported')
    await page.evaluate(() => window.__trial.prepare())
    assert.deepEqual(await counts(page), { runtime: 0, imports: 0, init: 0 })
  })
  await fixture('Unpublished conversion cannot be downloaded', { published: false, approved: true }, async page => {
    await status(page, 'unavailable')
    await page.evaluate(() => window.__trial.prepare())
    assert.deepEqual(await counts(page), { runtime: 0, imports: 0, init: 0 })
    assert.equal(await page.evaluate(() => window.__calls.preflight.length), 0)
  })
  await fixture('Explicit consent loads only the pinned trial; generated replies always use it', {}, async page => {
    await status(page, 'consent')
    await page.evaluate(() => window.__trial.prepare())
    await status(page, 'ready')
    assert.equal(await page.evaluate(key => localStorage.getItem(key), consentKey), 'true')
    assert.equal(await page.evaluate(() => window.__trial.offlineSaved), true)
    await page.evaluate(async () => {
      await window.__trial.send('Synthetic English question', [])
      window.__online = false
      await window.__trial.send('Synthetic second question', [])
    })
    const calls = await page.evaluate(() => window.__calls)
    assert.equal(calls.init.length, 1)
    assert.equal(calls.init[0].id, modelId)
    assert.equal(calls.init[0].record.model_id, modelId)
    assert.deepEqual(calls.generate.map(call => call.expectedModelId), [modelId, modelId])
  })
  await fixture('Approved cached trial reopens offline without another consent request', { approved: true, cached: true, online: false }, async page => {
    await status(page, 'ready')
    // A fresh JS realm reads the same model-specific preference after refresh.
    // Cached artifacts and the offline flag are still fixture inputs, not proof
    // that a real phone can refresh or run this model without a connection.
    await page.reload()
    await status(page, 'ready')
    const calls = await page.evaluate(() => window.__calls)
    assert.equal(calls.init.length, 1)
    assert.equal(calls.init[0].id, modelId)
    assert.deepEqual(calls.preflight, [{ modelCached: true }, { modelCached: true }])
    assert.equal(await page.evaluate(() => window.__states.includes('consent')), false)
    assert.equal(await page.evaluate(() => window.__trial.offlineSaved), true)
  })
  await fixture('Spanish replies retain the chosen language and pinned local model', { approved: true, cached: true, language: 'es' }, async page => {
    await status(page, 'ready')
    await page.evaluate(() => window.__trial.send('Pregunta ficticia para una prueba', []))
    const generation = await page.evaluate(() => window.__calls.generate[0])
    assert.equal(generation.language, 'es')
    assert.equal(generation.expectedModelId, modelId)
    assert.ok(generation.messages.some(message => /Spanish|español/.test(message.content)))
  })
  await fixture('Cancelled initialization cannot become ready; a subsequent retry succeeds', { initDeferred: true }, async page => {
    await status(page, 'consent')
    await page.evaluate(() => { void window.__trial.prepare() })
    await status(page, 'downloading')
    await page.waitForFunction(() => window.__pendingInit.length === 1)
    await page.evaluate(() => { window.__trial.pause(); window.__pendingInit[0].resolve() })
    await status(page, 'paused')
    assert.equal(await page.evaluate(() => window.__pendingInit[0].signal.aborted), true)
    assert.equal(await page.evaluate(() => window.__trial.offlineSaved), false)
    assert.equal(await page.evaluate(key => localStorage.getItem(key), consentKey), 'false')
    await page.evaluate(() => { void window.__trial.retry() })
    await page.waitForFunction(() => window.__pendingInit.length === 2)
    await page.evaluate(() => window.__pendingInit[1].resolve())
    await status(page, 'ready')
    assert.equal(await page.evaluate(() => window.__calls.init.length), 2)
  })
  await fixture('Unmounted compatibility checks cannot initiate a download', { approved: true, preflightDeferred: true }, async page => {
    await page.waitForFunction(() => typeof window.__resolvePreflight === 'function')
    await page.evaluate(async () => { window.__root.unmount(); window.__resolvePreflight(); await new Promise(resolve => setTimeout(resolve, 0)) })
    assert.deepEqual(await counts(page), { runtime: 0, imports: 0, init: 0 })
  })
  await fixture('Immediate retry escapes an aborted compatibility check that has not settled', { approved: true, preflightDeferred: true }, async page => {
    await page.waitForFunction(() => typeof window.__resolvePreflight === 'function')
    await page.evaluate(() => { window.__trial.pause(); void window.__trial.retry() })
    await page.waitForFunction(() => window.__trial.status === 'ready', null, { timeout: 1500 })
    await page.evaluate(async () => { window.__resolvePreflight(); await new Promise(resolve => setTimeout(resolve, 0)) })
    assert.equal(await page.evaluate(() => window.__calls.init.length), 1)
  })
  await fixture('An immediate retry queued during initialization resumes once it unwinds', { approved: true, initDeferred: true }, async page => {
    await page.waitForFunction(() => window.__pendingInit.length === 1)
    await page.evaluate(() => { window.__trial.pause(); void window.__trial.retry(); window.__pendingInit[0].reject(new DOMException('Stopped', 'AbortError')) })
    await page.waitForFunction(() => window.__pendingInit.length === 2)
    await page.evaluate(() => window.__pendingInit[1].resolve())
    await status(page, 'ready')
    assert.equal(await page.evaluate(() => window.__calls.init.length), 2)
  })
  await fixture('Failed initialization records its stage and allows another attempt', { approved: true, initDeferred: true }, async page => {
    await page.waitForFunction(() => window.__pendingInit.length === 1)
    await page.evaluate(() => window.__pendingInit[0].reject(new Error('Synthetic initialization error')))
    await status(page, 'error')
    assert.equal(await page.evaluate(() => window.__trial.lastFailureStage), 'model-download')
    await page.evaluate(() => { void window.__trial.retry() })
    await page.waitForFunction(() => window.__pendingInit.length === 2)
    await page.evaluate(() => window.__pendingInit[1].resolve())
    await status(page, 'ready')
  })
  const output = process.env.KIT_TRIAL_LIFECYCLE_RESULTS || path.join(repo, 'verification/medical-trial-lifecycle-results.json')
  await fs.writeFile(output, JSON.stringify({ checkedAt: new Date().toISOString(), scope: 'Real React StrictMode hook with mocked GPU, SDK, and offline storage. No real inference or physical-phone validation.', checks: results.length, results }, null, 2) + '\n')
  console.log(JSON.stringify({ result: 'pass', checks: results.length, output }))
} finally {
  await browser.close()
  await new Promise(resolve => server.close(resolve))
}
