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
const pauseKey = `${consentKey}:paused`
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
    export const invalidateEngine = () => { window.__calls.invalidations++; window.__engineLoaded=false; };
    export const initEngine = async (id,onProgress,signal,record) => {
      window.__calls.init.push({id,record});
      if(window.__engineLoaded) return;
      if(!window.__cached) window.__calls.modelDownloads++;
      onProgress({progress:45});
      if(window.__scenario.initDeferred) await new Promise((resolve,reject) => window.__pendingInit.push({resolve,reject,signal}));
      if(signal.aborted) throw new DOMException('Stopped','AbortError');
      window.__cached=window.__scenario.cacheAfterLoad !== false;
      window.__engineLoaded=true;
      onProgress({progress:100});
    };
    export const generateReply = async (messages,options) => {
      window.__calls.generate.push({messages,expectedModelId:options.expectedModelId,language:options.language});
      options.onStream?.('Synthetic local fixture');
      if(window.__scenario.generateDeferred) await new Promise((resolve,reject) => window.__pendingGeneration.push({resolve,reject,signal:options.signal}));
      if(options.signal.aborted) throw new DOMException('Stopped','AbortError');
      if(window.__scenario.failFirstGeneration && window.__calls.generate.length === 1) { window.__engineLoaded=false; throw new Error('Synthetic generation error'); }
      return 'Synthetic local fixture reply';
    };`,
}
const bundle = await build({
  stdin: {
    contents: `import React,{useEffect} from 'react'; import {createRoot} from 'react-dom/client'; import {useOfflineAssistant} from './src/hooks/useOfflineAssistant.js';
      function Harness(){const trial=useOfflineAssistant();window.__trial={...trial,send:trial.sendMessage};useEffect(()=>{window.__states.push(trial.status)},[trial.status]);return React.createElement('div',{'data-status':trial.status},trial.status)}
      window.__mount=()=>{window.__root=createRoot(document.getElementById('app'));window.__root.render(React.createElement(React.StrictMode,null,React.createElement(Harness)))};window.__mount();`,
    resolveDir: path.join(repo, 'frontend'), loader: 'jsx',
  },
  bundle: true, write: false, format: 'iife', platform: 'browser',
  define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'assistant-fixture-dependencies', setup(builder) {
    builder.onResolve({ filter: /(?:SettingsContext|useOfflineApp|medicalTrialConfig|modelTrialCheck|offlineAppService|webllmService)(?:\.js)?$/ }, args => {
      const name = path.basename(args.path).replace(/\.js$/, '')
      return name in mocks ? { path: name, namespace: 'assistant-fixture' } : undefined
    })
    builder.onLoad({ filter: /.*/, namespace: 'assistant-fixture' }, args => ({ contents: mocks[args.path], loader: 'js' }))
    builder.onResolve({ filter: /onlineMedicalService/ }, () => { throw Error('Local assistant hook must not import an online provider') })
  } }],
})
const server = http.createServer((request, response) => {
  response.setHeader('Content-Type', request.url === '/bundle.js' ? 'text/javascript' : 'text/html')
  response.end(request.url === '/bundle.js' ? bundle.outputFiles[0].text : '<!doctype html><div id="app"></div><script src="/bundle.js"></script>')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const url = `http://127.0.0.1:${server.address().port}/`
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE_PATH ? { executablePath: process.env.CHROME_EXECUTABLE_PATH } : {}) })
const results = []
async function fixture(name, scenario, exercise) {
  const context = await browser.newContext()
  const errors = [], externalRequests = []
  await context.addInitScript(({ scenario, consentKey, pauseKey }) => {
    window.__scenario = scenario
    window.__cached = scenario.cached === true
    window.__engineLoaded = false
    window.__online = scenario.online !== false
    window.__snapshot = { status: 'ready', runtimeSaved: true }
    window.__states = []
    window.__pendingInit = []
    window.__pendingGeneration = []
    window.__calls = { preflight: [], serviceImports: 0, runtimeSaves: 0, appSaves: 0, appChecks: 0, init: [], cacheChecks: [], generate: [], persist: 0, invalidations: 0, modelDownloads: 0 }
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => window.__online })
    Object.defineProperty(navigator, 'storage', { configurable: true, value: { persist: async () => { window.__calls.persist++; return false } } })
    if (scenario.approved) localStorage.setItem(consentKey, 'true')
    if (scenario.paused) localStorage.setItem(pauseKey, 'true')
    if (scenario.legacyApproved) localStorage.setItem('kit-ai-offline-download-approved', 'true')
    if (scenario.previousTrialApproved) localStorage.setItem('kit-ai-trial-download-approved:kit-medical-3b-previous-revision', 'true')
  }, { scenario, consentKey, pauseKey })
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
  await fixture('Explicit consent loads only the pinned owner model; generated replies always use it', {}, async page => {
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
  await fixture('Approved cached owner model reopens offline without another consent request', { approved: true, cached: true, online: false }, async page => {
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
    assert.equal(await page.evaluate(key => localStorage.getItem(key), consentKey), 'true')
    assert.equal(await page.evaluate(key => localStorage.getItem(key), pauseKey), 'true')
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

  await fixture('Resume without approval cannot authorize the large download', {}, async page => {
    await status(page, 'consent')
    await page.evaluate(() => window.__trial.resume())
    await status(page, 'consent')
    await page.evaluate(() => window.__trial.retry())
    await status(page, 'consent')
    assert.deepEqual(await counts(page), { runtime: 0, imports: 0, init: 0 })
    assert.equal(await page.evaluate(() => window.__trial.needsDownloadConsent), true)
    assert.equal(await page.evaluate(key => localStorage.getItem(key), consentKey), null)
  })
  await fixture('A deliberately paused download stays paused after reconnect and reload', { approved: true, paused: true }, async page => {
    await status(page, 'paused')
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await page.reload()
    await status(page, 'paused')
    assert.deepEqual(await counts(page), { runtime: 0, imports: 0, init: 0 })
    await page.evaluate(() => window.__trial.resume())
    await status(page, 'ready')
    assert.equal(await page.evaluate(key => localStorage.getItem(key), pauseKey), 'false')
    assert.equal(await page.evaluate(() => window.__trial.needsDownloadConsent), false)
  })
  await fixture('Reconnecting resumes an approved incomplete download without approval again', { approved: true, online: false }, async page => {
    await status(page, 'waiting')
    assert.equal(await page.evaluate(() => window.__calls.init.length), 0)
    await page.evaluate(() => { window.__online = true; window.dispatchEvent(new Event('online')) })
    await status(page, 'ready')
    assert.equal(await page.evaluate(() => window.__calls.init.length), 1)
    assert.equal(await page.evaluate(() => window.__states.includes('consent')), false)
  })
  await fixture('Reconnecting while a failed partial download unwinds queues exactly one retry', { approved: true, initDeferred: true }, async page => {
    await page.waitForFunction(() => window.__pendingInit.length === 1)
    await page.evaluate(() => {
      window.__online = false
      window.__pendingInit[0].reject(new Error('Synthetic connection lost'))
      window.__online = true
      window.dispatchEvent(new Event('online'))
    })
    await page.waitForFunction(() => window.__pendingInit.length === 2)
    await page.evaluate(() => window.__pendingInit[1].resolve())
    await status(page, 'ready')
    assert.equal(await page.evaluate(() => window.__calls.init.length), 2)
    assert.equal(await page.evaluate(() => window.__states.includes('consent')), false)
  })
  await fixture('Saved guides or model metadata never prove that AI is ready', { approved: true, cached: true, initDeferred: true }, async page => {
    await status(page, 'loading')
    assert.equal(await page.evaluate(() => window.__trial.offlineApp.status), 'ready')
    assert.equal(await page.evaluate(() => window.__trial.offlineSaved), false)
    assert.equal(await page.evaluate(() => window.__states.includes('ready')), false)
    await page.evaluate(() => window.__pendingInit[0].resolve())
    await status(page, 'ready')
    assert.equal(await page.evaluate(() => window.__trial.offlineSaved), true)
  })
  await fixture('Successful generation setup without cached artifacts cannot claim offline saving', { approved: true, cacheAfterLoad: false }, async page => {
    await status(page, 'ready')
    assert.equal(await page.evaluate(() => window.__trial.offlineSaved), false)
  })
  await fixture('Stopping drains the generation before allowing a fresh question', { approved: true, cached: true, generateDeferred: true }, async page => {
    await status(page, 'ready')
    await page.evaluate(() => {
      window.__abortAnswer = new AbortController()
      window.__answerResult = window.__trial.send('Synthetic question', [], undefined, window.__abortAnswer.signal).then(() => 'resolved', error => error.name)
    })
    await page.waitForFunction(() => window.__pendingGeneration.length === 1 && window.__trial.isGenerating)
    await page.evaluate(() => window.__abortAnswer.abort())
    assert.equal(await page.evaluate(() => window.__pendingGeneration[0].signal.aborted), true)
    assert.equal(await page.evaluate(() => window.__trial.isGenerating), true)
    assert.match(await page.evaluate(() => window.__trial.send('Too soon', []).catch(error => error.message)), /already in progress/)
    await page.evaluate(() => window.__pendingGeneration[0].resolve())
    assert.equal(await page.evaluate(() => window.__answerResult), 'AbortError')
    await page.waitForFunction(() => !window.__trial.isGenerating)
    await status(page, 'ready')
    await page.evaluate(() => { window.__scenario.generateDeferred = false; return window.__trial.send('Fresh question', []) })
    assert.equal(await page.evaluate(() => window.__calls.generate.length), 2)
  })
  await fixture('Failed generation can reload the same pinned model and answer again', { approved: true, cached: true, failFirstGeneration: true }, async page => {
    await status(page, 'ready')
    await page.evaluate(() => window.__trial.send('Synthetic question', []).catch(error => error.message))
    await status(page, 'error')
    assert.equal(await page.evaluate(() => window.__trial.lastFailureStage), 'generation')
    assert.equal(await page.evaluate(() => window.__trial.offlineSaved), false)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    assert.equal(await page.evaluate(() => window.__calls.init.length), 1)
    await page.evaluate(() => window.__trial.retry())
    await status(page, 'ready')
    await page.evaluate(() => window.__trial.send('Retry question', []))
    assert.equal(await page.evaluate(() => window.__trial.lastFailureStage), null)
    assert.deepEqual(await page.evaluate(() => window.__calls.generate.map(call => call.expectedModelId)), [modelId, modelId])
  })
  await fixture('Unmounting aborts a running answer without a late state update', { approved: true, cached: true, generateDeferred: true }, async page => {
    await status(page, 'ready')
    await page.evaluate(() => { window.__answerResult = window.__trial.send('Synthetic question', []).then(() => 'resolved', error => error.name) })
    await page.waitForFunction(() => window.__pendingGeneration.length === 1)
    await page.evaluate(() => window.__root.unmount())
    assert.equal(await page.evaluate(() => window.__pendingGeneration[0].signal.aborted), true)
    await page.evaluate(() => window.__pendingGeneration[0].resolve())
    assert.equal(await page.evaluate(() => window.__answerResult), 'AbortError')
  })

  await fixture('Finish saving repairs missing app and runtime files without downloading cached weights again', { approved: true, cached: true }, async page => {
    await status(page, 'ready')
    assert.equal(await page.evaluate(() => window.__trial.offlineSaved), true)
    await page.evaluate(() => {
      window.__snapshot.status = 'error'
      window.__snapshot.runtimeSaved = false
      return window.__trial.retry()
    })
    await status(page, 'ready')
    const calls = await page.evaluate(() => window.__calls)
    assert.equal(calls.appSaves, 1)
    assert.equal(calls.runtimeSaves, 2)
    assert.equal(calls.invalidations, 0)
    assert.equal(calls.modelDownloads, 0)
    assert.deepEqual(calls.init.map(call => call.id), [modelId, modelId])
    assert.equal(await page.evaluate(() => window.__trial.offlineSaved), true)
    assert.equal(await page.evaluate(() => window.__states.includes('consent')), false)
  })
  await fixture('Finish saving repairs missing model files even when an engine is already ready', { approved: true, cacheAfterLoad: false }, async page => {
    await status(page, 'ready')
    assert.equal(await page.evaluate(() => window.__trial.offlineSaved), false)
    await page.evaluate(() => {
      window.__scenario.cacheAfterLoad = true
      return window.__trial.retry()
    })
    await status(page, 'ready')
    const calls = await page.evaluate(() => window.__calls)
    assert.equal(calls.invalidations, 1)
    assert.equal(calls.modelDownloads, 2)
    assert.deepEqual(calls.init.map(call => call.id), [modelId, modelId])
    assert.equal(await page.evaluate(() => window.__trial.offlineSaved), true)
    assert.equal(await page.evaluate(key => localStorage.getItem(key), consentKey), 'true')
    assert.equal(await page.evaluate(() => window.__states.includes('consent')), false)
  })
  await fixture('Repair waits for internet instead of attempting an uncached download offline', { approved: true, cacheAfterLoad: false }, async page => {
    await status(page, 'ready')
    await page.evaluate(() => { window.__online = false; return window.__trial.retry() })
    await status(page, 'waiting')
    assert.equal(await page.evaluate(() => window.__trial.offlineSaved), false)
    assert.equal(await page.evaluate(() => window.__calls.modelDownloads), 1)
    assert.equal(await page.evaluate(() => window.__calls.invalidations), 0)
    await page.evaluate(() => { window.__online = true; window.__scenario.cacheAfterLoad = true; window.dispatchEvent(new Event('online')) })
    await status(page, 'ready')
    assert.equal(await page.evaluate(() => window.__calls.invalidations), 1)
    assert.equal(await page.evaluate(() => window.__calls.modelDownloads), 2)
    assert.equal(await page.evaluate(() => window.__trial.offlineSaved), true)
  })
  await fixture('Finish saving cannot invalidate the engine while an answer is in progress', { approved: true, cached: true, generateDeferred: true }, async page => {
    await status(page, 'ready')
    await page.evaluate(() => { window.__answerResult = window.__trial.send('Synthetic question', []) })
    await page.waitForFunction(() => window.__pendingGeneration.length === 1)
    await page.evaluate(() => { window.__cached = false; return window.__trial.retry() })
    assert.equal(await page.evaluate(() => window.__calls.invalidations), 0)
    assert.equal(await page.evaluate(() => window.__calls.init.length), 1)
    assert.equal(await page.evaluate(() => window.__pendingGeneration[0].signal.aborted), false)
    await page.evaluate(() => window.__pendingGeneration[0].resolve())
    await page.evaluate(() => window.__answerResult)
    await status(page, 'ready')
  })
  const output = process.env.KIT_ASSISTANT_LIFECYCLE_RESULTS || path.join(repo, 'verification/offline-assistant-lifecycle-results.json')
  await fs.writeFile(output, JSON.stringify({ checkedAt: new Date().toISOString(), scope: 'Real React StrictMode hook with mocked GPU, SDK, and offline storage. No real inference or physical-phone validation.', checks: results.length, results }, null, 2) + '\n')
  console.log(JSON.stringify({ result: 'pass', checks: results.length, output }))
} finally {
  await browser.close()
  await new Promise(resolve => server.close(resolve))
}
