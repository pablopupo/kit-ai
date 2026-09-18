import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.KIT_PLAYWRIGHT_MODULE || 'playwright');
import fs from 'node:fs';
import crypto from 'node:crypto';
import { startOwnedServer, stopOwnedServer, isolatedChromePids, closeBrowserAndConfirmExit } from './lifecycle.mjs';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = process.env.KIT_MODEL_WORK_DIR || path.resolve(repo, '../model-conversion');
const output = process.env.KIT_BROWSER_OUTPUT || `${repo}/evaluations/results/medical-3b-mlc-browser-${Date.now()}.json`;
const url = 'http://127.0.0.1:4190/browser-eval/';
const cases = JSON.parse(fs.readFileSync(`${root}/browser-eval/cases.json`, 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const report = {
  schemaVersion: 1, startedAt: new Date().toISOString(), kind: 'desktop-browser-conversion-experiment',
  clinicalReview: 'pending', phoneTest: false, hostedModelTest: false,
  model: 'Pablo305/llama3-medical-3b-4bit', modelRevision: cases.modelRevision,
  format: 'MLC q4f16_1 converted from the published NF4 checkpoint through a dequantized float export',
  webllmVersion: JSON.parse(fs.readFileSync(`${repo}/frontend/node_modules/@mlc-ai/web-llm/package.json`)).version,
  librarySource: 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/Llama-3.2-3B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm',
  artifactHashes: { config: hash(`${root}/mlc-q4f16_1/mlc-chat-config.json`), tensorManifest: hash(`${root}/mlc-q4f16_1/tensor-cache.json`), wasm: hash(`${root}/browser-eval/model.wasm`), cases: hash(`${root}/browser-eval/cases.json`) },
  datasetSha256: cases.datasetSha256,
  promptPipeline: 'Exact current Space prompting.build_messages(frozen app exactApiInput, 8); preserved Hugging Face chat template prefix in the MLC configuration.',
  generation: { temperature: 0, repetition_penalty: 1.1, max_tokens: 512, stream: true },
  runtimeOptions: { context_window_size: 4096, prefill_chunk_size: 128, useIndexedDBCache: true, required_features: ['shader-f16'] },
  selectedCaseIds: cases.cases.map(c => c.caseId), results: [], network: {}, externalRequests: [], errors: [],
  caveats: ['Desktop Chrome on this Mac only, not an iPhone or Android test.', 'Mechanics verification is separate from medical answer quality; incorrect outputs are retained.', 'Quantized MLC may differ from float or original NF4 output; matching prompts do not imply numerical parity.', 'Offline restart is a controlled browser-network-offline test with the local model server stopped, not a phone airplane-mode test.'],
  setupNotes: ['An initial attempt stopped before loading weights because the local server lacked WebLLM\'s /resolve/main/ route. A local route alias corrected that serving mismatch.', 'A preliminary Metal run inherited Playwright\'s unsafe-swiftshader default. This final run explicitly excludes that argument and checks the actual command line. Isolated experiment-origin storage was cleared before this cold load.'],
};
let phase = 'startup', context, page, ownedServer, lastProgress = -1;
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profilePath = `${root}/browser-profile`;
const readChromePids = () => isolatedChromePids(profilePath, chromePath);
const save = () => fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
function track(ctx) {
  ctx.on('request', request => {
    const stats = report.network[phase] ||= { requests: 0, shardRequests: 0, responses: 0, serviceWorkerResponses: 0, failures: [] };
    stats.requests++;
    if (request.url().endsWith('.bin')) stats.shardRequests++;
    if (!request.url().startsWith('http://127.0.0.1:4190/')) report.externalRequests.push({ phase, url: request.url() });
  });
  ctx.on('response', response => {
    const stats = report.network[phase] ||= { requests: 0, shardRequests: 0, responses: 0, serviceWorkerResponses: 0, failures: [] };
    stats.responses++;
    if (response.fromServiceWorker()) stats.serviceWorkerResponses++;
  });
  ctx.on('requestfailed', request => {
    const stats = report.network[phase] ||= { requests: 0, shardRequests: 0, responses: 0, serviceWorkerResponses: 0, failures: [] };
    stats.failures.push({ url: request.url(), failure: request.failure()?.errorText });
  });
}
async function launch(offline = false) {
  const ctx = await chromium.launchPersistentContext(`${root}/browser-profile`, {
    headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    viewport: { width: 1100, height: 700 }, args: ['--enable-automation'], chromiumSandbox: true,
    ignoreDefaultArgs: ['--enable-unsafe-swiftshader', '--unsafely-disable-devtools-self-xss-warnings'], offline,
  });
  context = ctx;
  const pids = readChromePids();
  if (pids.length === 0) throw new Error('Cannot identify the isolated Chrome process; refusing unverified close/restart claims.');
  (report.browserProcessObservations ||= []).push({ phase, observedPids: pids });
  track(ctx);
  await ctx.exposeFunction('reportProgress', p => {
    const percent = Math.floor(p.progress * 100 / 10) * 10;
    if (percent !== lastProgress) { lastProgress = percent; console.log('PROGRESS', phase, percent, p.text); }
  });
  const tab = ctx.pages()[0] || await ctx.newPage();
  tab.on('pageerror', error => { report.errors.push({ phase, type: 'pageerror', message: error.message }); save(); });
  tab.on('console', message => { if (message.type() === 'error') console.log('BROWSER_ERROR', phase, message.text().slice(0,500)); });
  await tab.goto(url, { waitUntil: 'load', timeout: 45000 });
  await tab.waitForFunction(() => window.kitEval?.ready, { timeout: 45000 });
  return { ctx, tab };
}
async function evaluate(fn, arg, timeout = 300000) {
  let timer;
  try { return await Promise.race([page.evaluate(fn,arg),new Promise((_,reject) => { timer=setTimeout(() => reject(new Error(`Timeout in ${phase}`)),timeout); })]); }
  finally { clearTimeout(timer); }
}
async function ask(c) {
  phase = c.caseId;
  const result = await evaluate(messages => window.kitEval.ask(messages), c.messages, 120000);
  const record = { caseId: c.caseId, language: c.language, messages: c.messages, ...result,
    floatReferenceAnswer: c.floatAnswer, exactlyMatchesFloatAnswer: result.answer === c.floatAnswer };
  report.results.push(record); save();
  console.log('ANSWER', c.caseId, result.elapsedMs, result.finishReason, result.answer.slice(0,120).replaceAll('\n',' '));
}
async function closeContext() {
  if (!context) return;
  const result = await closeBrowserAndConfirmExit(context, readChromePids);
  (report.browserCloseConfirmations ||= []).push({ phase, ...result });
  if (result.closeWarning) (report.automationNotes ||= []).push(result.closeWarning);
  context = null;
  return result;
}
try {
  ownedServer = await startOwnedServer(path.resolve(repo, 'model-tools/browser-eval/server.mjs'), { KIT_MODEL_WORK_DIR: root });
  report.server = { ownedChild: true, pid: ownedServer.pid };
  ({ ctx: context, tab: page } = await launch());
  const cdp = await context.newCDPSession(page);
  const command = await cdp.send('Browser.getBrowserCommandLine');
  report.browser = { version: context.browser()?.version(), headless: true, executable: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', explicitlyAddedArguments: ['--enable-automation'], excludedDefaultArguments: ['--enable-unsafe-swiftshader', '--unsafely-disable-devtools-self-xss-warnings'], chromiumSandbox: true, actualArguments:command.arguments };
  if(command.arguments.some(arg=>/unsafe|swiftshader|disable-gpu/.test(arg))) throw Error('Unexpected GPU override in actual Chrome command line');
  await cdp.send('Storage.clearDataForOrigin',{origin:'http://127.0.0.1:4190',storageTypes:'all'});
  await page.reload(); await page.waitForFunction(() => window.kitEval?.ready);
  report.gpu = await evaluate(() => window.kitEval.gpu());
  console.log('GPU', JSON.stringify(report.gpu)); save();
  if (!report.gpu.supported || report.gpu.isFallbackAdapter || !report.gpu.features.includes('shader-f16')) throw new Error('A real compatible GPU was not available.');
  report.shell = await evaluate(() => window.kitEval.prepareShell());
  phase = 'initial-model-load';
  report.initialization = await evaluate(() => window.kitEval.init());
  console.log('INITIALIZED', JSON.stringify(report.initialization)); save();
  for (const c of cases.cases) await ask(c);
  const closedBrowser = await closeContext();
  phase = 'offline-browser-restart';
  const serverExit = await stopOwnedServer(ownedServer);
  report.offlineRestart = { browserFullyClosed: closedBrowser.confirmedExited, serverStopped: serverExit.exited, ownedServerExit: serverExit, browserNetworkOffline: true };
  save(); lastProgress = -1;
  ({ ctx: context, tab: page } = await launch(true));
  const offlineCdp = await context.newCDPSession(page);
  report.offlineRestart.actualArguments = (await offlineCdp.send('Browser.getBrowserCommandLine')).arguments;
  if(report.offlineRestart.actualArguments.some(arg=>/unsafe|swiftshader|disable-gpu/.test(arg))) throw Error('Unexpected offline GPU override');
  report.offlineRestart.shellLoaded = true;
  report.offlineRestart.pageControlled = await evaluate(() => !!navigator.serviceWorker.controller);
  report.offlineRestart.initialization = await evaluate(() => window.kitEval.init());
  const c = cases.cases.find(c => c.caseId === 'minor-cut-es');
  report.offlineRestart.result = { caseId:c.caseId, messages:c.messages, ...await evaluate(messages => window.kitEval.ask(messages), c.messages, 120000) };
  report.offlineRestart.success = !!report.offlineRestart.result.answer;
  console.log('OFFLINE_RESTART', JSON.stringify({ ...report.offlineRestart, result: { answerLength:report.offlineRestart.result.answer.length, online:report.offlineRestart.result.online } }));
  report.complete = true;
} catch (error) {
  report.errors.push({ phase, message: error.message, stack: error.stack }); report.complete = false;
  console.log('FAILED', phase, error.stack); process.exitCode = 1;
} finally {
  try { await closeContext(); }
  catch (error) { report.errors.push({ phase: 'browser-cleanup', message: error.message }); report.complete = false; }
  try { report.serverCleanup = await stopOwnedServer(ownedServer); }
  catch (error) { report.errors.push({ phase: 'server-cleanup', message: error.message }); report.complete = false; }
  report.finishedAt = new Date().toISOString(); save(); console.log('SAVED', output);
  // Some Playwright transports remain open after the browser process exits.
  process.exit(report.complete ? 0 : 1);
}
