import { fork, execFileSync } from 'node:child_process';

function deadline(promise, ms, label) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  })]).finally(() => clearTimeout(timer));
}

export async function stopOwnedServer(child, timeoutMs = 5000) {
  if (!child) return { owned: false, exited: true };
  if (child.exitCode === null && child.signalCode === null) {
    const exit = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGTERM');
    try { await deadline(exit, timeoutMs, 'Owned server exit'); }
    catch {
      child.kill('SIGKILL');
      await deadline(exit, timeoutMs, 'Owned server forced exit');
    }
  }
  if (child.exitCode === null && child.signalCode === null) throw new Error('Owned server exit was not confirmed');
  return { owned: true, pid: child.pid, exited: true, exitCode: child.exitCode, signal: child.signalCode };
}

export async function startOwnedServer(script, env, timeoutMs = 10000) {
  const child = fork(script, [], { env: { ...process.env, ...env }, silent: true });
  let stderr = '';
  child.stderr.on('data', data => { stderr = (stderr + data).slice(-2000); });
  child.stdout.resume();
  try {
    await deadline(new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => reject(new Error(`Owned server exited before ready (${code ?? signal}): ${stderr}`)));
      child.on('message', message => { if (message?.type === 'ready' && message.port === 4190) resolve(); });
    }), timeoutMs, 'Owned server startup');
    return child;
  } catch (error) {
    await stopOwnedServer(child);
    throw error;
  }
}

export function isolatedChromePids(profilePath, executable) {
  const output = execFileSync('/bin/ps', ['-axo', 'pid=,command='], { encoding: 'utf8', timeout: 5000 });
  const profileArg = `--user-data-dir=${profilePath}`;
  return output.split('\n').flatMap(line => {
    const match = line.trim().match(/^(\d+)\s+(.+)$/);
    if (!match) return [];
    const command = match[2];
    return command.startsWith(`${executable} `)
      && (command.includes(`${profileArg} `) || command.endsWith(profileArg)) ? [Number(match[1])] : [];
  });
}

export async function closeBrowserAndConfirmExit(context, readPids, { closeTimeoutMs = 10000, exitTimeoutMs = 5000 } = {}) {
  let closeWarning = null;
  try { await deadline(context.close(), closeTimeoutMs, 'Playwright browser close'); }
  catch (error) { closeWarning = error.message; }
  const until = Date.now() + exitTimeoutMs;
  let remaining;
  do {
    remaining = readPids();
    if (remaining.length === 0) return { confirmedExited: true, closeWarning };
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (Date.now() < until);
  throw new Error(`Isolated Chrome process exit not confirmed; remaining PIDs: ${remaining.join(', ')}`);
}
