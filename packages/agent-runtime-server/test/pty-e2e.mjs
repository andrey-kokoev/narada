import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const binPath = fileURLToPath(new URL('../bin/narada-agent-runtime-server.mjs', import.meta.url));

let ptyModule;
try {
  ptyModule = await import('node-pty');
} catch (error) {
  if (process.env.NARADA_AGENT_RUNTIME_PTY_E2E === 'skip') process.exit(0);
  throw new Error(`node-pty unavailable; run pnpm install or set NARADA_AGENT_RUNTIME_PTY_E2E=skip to opt out: ${error?.message ?? error}`);
}

const pty = ptyModule.default ?? ptyModule;

function waitFor(predicate, timeoutMs, label) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        reject(new Error(`runtime_server_pty_e2e_timeout:${label}`));
        return;
      }
      setTimeout(poll, 20);
    };
    poll();
  });
}

function withTimeout(promise, timeoutMs, label) {
  let timer = null;
  return Promise.race([
    promise.finally(() => { if (timer) clearTimeout(timer); }),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`runtime_server_pty_e2e_timeout:${label}`)), timeoutMs);
    }),
  ]);
}

async function runPtyE2E() {
  const siteRoot = mkdtempSync(join(tmpdir(), 'narada-runtime-server-pty-e2e-'));
  const provider = createServer((request, response) => {
    request.resume();
    request.on('end', () => {
      response.setHeader('content-type', 'application/json');
      response.setHeader('connection', 'close');
      response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'real pty response' } }] }));
    });
  });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  provider.unref();
  const providerAddress = provider.address();
  let terminal = null;
  let terminalExited = false;
  let terminalReleased = false;
  let output = '';
  const terminateTerminal = () => {
    if (!terminal || terminalReleased) return;
    terminalReleased = true;
    try { terminal.kill(); } catch {}
  };
  const disposeExitedTerminal = () => {
    if (!terminal || !terminalExited || terminalReleased) return;
    terminalReleased = true;
    // node-pty's normal ConPTY exit leaves its drain worker alive; close the
    // version-pinned handles after exit while keeping public kill() for failures.
    const agent = terminal._agent;
    try { agent?._inSocket?.destroy(); } catch {}
    try { agent?._outSocket?.destroy(); } catch {}
    try { agent?._conoutSocketWorker?.dispose(); } catch {}
  };
  try {
    terminal = pty.spawn(process.execPath, [
      binPath,
      '--no-health',
      '--no-events',
      '--identity', 'narada.test',
      '--session', 'real-pty-e2e',
    ], {
      cwd: packageRoot,
      cols: 100,
      rows: 30,
      env: {
        ...process.env,
        NARADA_SITE_ROOT: siteRoot,
        NARADA_INTELLIGENCE_PROVIDER: 'openai-api',
        OPENAI_BASE_URL: `http://127.0.0.1:${providerAddress.port}/`,
        OPENAI_API_KEY: 'real-pty-e2e-key',
        NARADA_AGENT_CLI_COLOR: '0',
        NO_COLOR: '1',
        FORCE_COLOR: '0',
      },
    });
    terminal.onData((chunk) => {
      output += chunk;
    });
    const exit = new Promise((resolve) => terminal.onExit((event) => {
      terminalExited = true;
      resolve(event);
    }));

    await waitFor(() => output.includes('operator >'), 7000, 'interactive_prompt');
    terminal.write('hello\r');
    await waitFor(() => output.includes('real pty response'), 7000, 'provider_response');
    assert.equal(output.includes('runtime_output_failure'), false);
    assert.equal(output.includes('"method"'), false);

    terminal.write('/exit\r');
    let exitEvent;
    try {
      exitEvent = await withTimeout(exit, 7000, 'runtime_exit');
    } catch (error) {
      throw new Error(`${error.message}\npty_output:${JSON.stringify(output)}`);
    }
    disposeExitedTerminal();
    assert.equal(exitEvent.exitCode, 0, output);
    assert.equal(output.includes('session closed'), true);
  } finally {
    provider.closeAllConnections?.();
    provider.closeIdleConnections?.();
    if (provider.listening) {
      await Promise.race([
        new Promise((resolve) => provider.close(resolve)),
        new Promise((resolve) => setTimeout(resolve, 1000)),
      ]);
    }
    if (terminalExited) disposeExitedTerminal();
    else terminateTerminal();
    await rm(siteRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => {});
  }
}

await runPtyE2E();
console.log('runtime server PTY E2E passed');
