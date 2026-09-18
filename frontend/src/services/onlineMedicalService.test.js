import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

let fixtureId = 0;

// Compile the real browser module with Vite's underlying bundler so import.meta.env
// and extensionless imports work in Node. Only the external Gradio transport is fake.
async function loadService(t, { events, cancel = async () => {}, online = true } = {}) {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: online }, configurable: true });
  t.after(() => {
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else delete globalThis.navigator;
  });
  const calls = { connects: 0, closes: 0, cancels: 0, submitted: null };
  let markSubmitted;
  const submitted = new Promise(resolve => { markSubmitted = resolve; });
  const client = {
    close() { calls.closes += 1; },
    submit(endpoint, args) {
      calls.submitted = { endpoint, args };
      markSubmitted();
      return {
        async cancel() { calls.cancels += 1; return cancel(); },
        async *[Symbol.asyncIterator]() { yield* events(); },
      };
    },
  };
  const key = `__kitOnlineTest${++fixtureId}`;
  globalThis[key] = { async connect() { calls.connects += 1; return client; } };
  t.after(() => { delete globalThis[key]; });
  const bundled = await build({
    entryPoints: [new URL('./onlineMedicalService.js', import.meta.url).pathname],
    bundle: true,
    format: 'esm',
    write: false,
    define: { 'import.meta.env': '{}' },
    plugins: [{
      name: 'fake-gradio-transport',
      setup(buildContext) {
        buildContext.onResolve({ filter: /^@gradio\/client$/ }, () => ({ path: 'client', namespace: 'test' }));
        buildContext.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `export const Client = globalThis[${JSON.stringify(key)}];` }));
      },
    }],
  });
  const service = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
  return { ...service, calls, submitted };
}

async function settleQuickly(promise) {
  let timer;
  try {
    return await Promise.race([
      promise.then(value => ({ value }), error => ({ error })),
      new Promise(resolve => { timer = setTimeout(() => resolve({ stalled: true }), 250); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

test('a completed answer is not held hostage by a stalled cancellation request', async t => {
  const { askMedicalModel, calls } = await loadService(t, {
    events: async function* () { yield { type: 'data', data: ['  A useful answer.  '] }; },
    cancel: () => new Promise(() => {}),
  });
  const result = await settleQuickly(askMedicalModel('How do I clean a small cut?', []));
  assert.equal(result.stalled, undefined, 'Completed answer must resolve without waiting for /cancel or /reset');
  assert.equal(result.value, 'A useful answer.');
  assert.ok(calls.closes > 0);
});

test('stopping a pending job promptly rejects and ignores later status events', async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { askMedicalModel, submitted, calls } = await loadService(t, {
    events: async function* () {
      yield { type: 'status', stage: 'pending' };
      await gate;
      yield { type: 'status', stage: 'generating' };
      yield { type: 'data', data: ['late answer'] };
    },
    cancel: () => new Promise(() => {}),
  });
  const controller = new AbortController();
  const statuses = [];
  const request = askMedicalModel('What is a sprain?', [], { signal: controller.signal, onStatus: status => statuses.push(status) });
  await submitted;
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  const result = await settleQuickly(request);
  release();
  assert.equal(result.stalled, undefined, 'Stop must not wait for a network cancellation acknowledgement');
  assert.equal(result.error?.name, 'AbortError');
  const statusCount = statuses.length;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(statuses.length, statusCount, 'A stopped job must not update another request’s status');
  assert.ok(calls.cancels > 0);
  assert.ok(calls.closes > 0);
});

test('offline requests do not contact the model', async t => {
  const { askMedicalModel, calls } = await loadService(t, { online: false });
  await assert.rejects(askMedicalModel('What is a sprain?', []), /internet connection/);
  assert.equal(calls.connects, 0);
});

test('model errors and empty responses fail with usable guidance', async t => {
  for (const [events, message] of [
    [async function* () { yield { type: 'status', stage: 'error' }; }, /could not complete/],
    [async function* () { yield { type: 'data', data: ['   '] }; }, /no answer/],
  ]) {
    await t.test(message.source, async child => {
      const { askMedicalModel, calls } = await loadService(child, { events });
      await assert.rejects(askMedicalModel('What is a sprain?', []), message);
      assert.ok(calls.closes > 0);
    });
  }
});
