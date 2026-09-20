import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { startOwnedServer, stopOwnedServer, closeBrowserAndConfirmExit } from './lifecycle.mjs';
const serverScript = fileURLToPath(new URL('./server.mjs', import.meta.url));
const request = url => new Promise((resolve, reject) => {
  http.get(url, response => {
    let text = '';
    response.on('data', data => { text += data; });
    response.on('end', () => resolve({ status: response.statusCode, text }));
  }).on('error', reject);
});

test('server is an owned child and its termination is confirmed', async () => {
  const child = await startOwnedServer(serverScript, {});
  try {
    assert.ok(child.pid > 1);
    const response = await request('http://127.0.0.1:4190/missing-lifecycle-probe');
    assert.equal(response.status, 404);
  } finally {
    const stopped = await stopOwnedServer(child);
    assert.equal(stopped.pid, child.pid);
    assert.equal(stopped.owned, true);
    assert.equal(stopped.exited, true);
    assert.ok(child.exitCode !== null || child.signalCode !== null);
  }
});

test('an occupied port fails startup without terminating its unrelated listener', async () => {
  const unrelated = http.createServer((request, response) => response.end('unrelated listener'));
  await new Promise((resolve, reject) => { unrelated.once('error', reject); unrelated.listen(4190, '127.0.0.1', resolve); });
  try {
    await assert.rejects(startOwnedServer(serverScript, {}), /exited before ready/);
    assert.equal(unrelated.listening, true);
    assert.equal((await request('http://127.0.0.1:4190/')).text, 'unrelated listener');
  } finally { await new Promise(resolve => unrelated.close(resolve)); }
});

test('a hung close promise can succeed only when process exit is independently confirmed', async () => {
  const closed = await closeBrowserAndConfirmExit({ close: () => new Promise(() => {}) }, () => [], { closeTimeoutMs: 5, exitTimeoutMs: 5 });
  assert.equal(closed.confirmedExited, true);
  assert.match(closed.closeWarning, /timed out/);
});

test('a resolved or timed-out close never proves exit while an isolated process remains', async () => {
  for (const close of [() => Promise.resolve(), () => new Promise(() => {})]) {
    await assert.rejects(closeBrowserAndConfirmExit({ close }, () => [123], { closeTimeoutMs: 5, exitTimeoutMs: 0 }), /exit not confirmed/);
  }
});
