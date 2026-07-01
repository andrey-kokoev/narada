import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function findHeadlessBrowser() {
  return [
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ].find((path) => existsSync(path)) ?? null;
}

export async function openCdpPage({ browserPath, url, userDataPrefix = 'narada-browser-smoke-' }) {
  const userDataDir = mkdtempSync(join(tmpdir(), userDataPrefix));
  const child = spawn(browserPath, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    '--window-size=1100,800',
    url,
  ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });

  const browserWsUrl = await new Promise((resolve, reject) => {
    let stderr = '';
    const timer = setTimeout(() => reject(new Error(`cdp_start_timeout:${stderr.slice(0, 500)}`)), 10000);
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`browser_exited_before_cdp:${code}:${stderr.slice(0, 500)}`));
    });
  });

  const browserUrl = new URL(browserWsUrl);
  const pages = await fetch(`http://${browserUrl.host}/json/list`).then((response) => response.json());
  const target = pages.find((entry) => entry.type === 'page') ?? pages[0];
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let id = 0;
  const pending = new Map();
  const networkRequests = new Map();
  const networkResponses = [];
  const networkWaiters = new Set();
  ws.addEventListener('message', (message) => {
    const payload = JSON.parse(String(message.data));
    if (payload.method === 'Network.requestWillBeSent') {
      networkRequests.set(payload.params.requestId, {
        request_id: payload.params.requestId,
        method: payload.params.request?.method,
        url: payload.params.request?.url,
      });
      return;
    }
    if (payload.method === 'Network.responseReceived') {
      const request = networkRequests.get(payload.params.requestId) ?? {};
      const entry = {
        request_id: payload.params.requestId,
        method: request.method,
        url: payload.params.response?.url ?? request.url,
        status: payload.params.response?.status,
        mime_type: payload.params.response?.mimeType,
      };
      networkResponses.push(entry);
      for (const waiter of [...networkWaiters]) {
        if (!waiter.predicate(entry)) continue;
        networkWaiters.delete(waiter);
        clearTimeout(waiter.timer);
        waiter.resolve({ found: true, ...entry, waited_ms: Date.now() - waiter.started });
      }
      return;
    }
    const waiter = pending.get(payload.id);
    if (!waiter) return;
    pending.delete(payload.id);
    if (payload.error) waiter.reject(new Error(JSON.stringify(payload.error)));
    else waiter.resolve(payload.result);
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const nextId = ++id;
    pending.set(nextId, { resolve, reject });
    ws.send(JSON.stringify({ id: nextId, method, params }));
  });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');

  return {
    async evaluate(expression) {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result?.value;
    },
    async textOccurrenceCount(text) {
      return await this.evaluate(`(() => {
        const text = ${JSON.stringify(text)};
        const body = document.body?.innerText ?? '';
        if (!text) return 0;
        let count = 0;
        let index = 0;
        while ((index = body.indexOf(text, index)) !== -1) {
          count += 1;
          index += text.length;
        }
        return count;
      })()`);
    },
    async waitForNetworkResponse(predicate, timeoutMs) {
      const started = Date.now();
      const existing = networkResponses.find(predicate);
      if (existing) return { found: true, ...existing, waited_ms: 0 };
      return await new Promise((resolve) => {
        const waiter = {
          predicate,
          started,
          resolve,
          timer: setTimeout(() => {
            networkWaiters.delete(waiter);
            resolve({ found: false, waited_ms: Date.now() - started, recent_responses: networkResponses.slice(-12) });
          }, timeoutMs),
        };
        networkWaiters.add(waiter);
      });
    },
    async getNetworkResponseBody(requestId) {
      const result = await send('Network.getResponseBody', { requestId }).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
      if (result?.error) return result;
      const body = result?.body ?? '';
      try { return JSON.parse(body); } catch { return { body, base64_encoded: Boolean(result?.base64Encoded) }; }
    },
    async close() {
      try { await send('Browser.close'); } catch {}
      try { ws.close(); } catch {}
      await new Promise((resolve) => {
        if (child.exitCode !== null || child.signalCode !== null) return resolve();
        const timer = setTimeout(() => {
          if (!child.killed) child.kill();
          resolve();
        }, 3000);
        child.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
      await rm(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => {});
    },
  };
}

export async function waitForPageText(page, text, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await page.evaluate(`document.body?.innerText?.includes(${JSON.stringify(text)}) ?? false`);
    if (result) return { found: true, waited_ms: Date.now() - started };
    await sleep(250);
  }
  const bodyText = await page.evaluate('document.body?.innerText?.slice(0, 1000) ?? ""').catch(() => '');
  return { found: false, waited_ms: Date.now() - started, body_text_sample: bodyText };
}

export async function waitForPageTextOccurrence(page, text, minimumCount, timeoutMs) {
  const started = Date.now();
  let count = 0;
  while (Date.now() - started < timeoutMs) {
    count = await page.textOccurrenceCount(text);
    if (count >= minimumCount) return { found: true, count, minimum_count: minimumCount, waited_ms: Date.now() - started };
    await sleep(250);
  }
  const bodyText = await page.evaluate('document.body?.innerText?.slice(0, 1000) ?? ""').catch(() => '');
  return { found: false, count, minimum_count: minimumCount, waited_ms: Date.now() - started, body_text_sample: bodyText };
}

export async function waitForPageTextWithAction(page, text, timeoutMs, action) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await action().catch(() => false);
    const result = await page.evaluate(`document.body?.innerText?.includes(${JSON.stringify(text)}) ?? false`);
    if (result) return { found: true, waited_ms: Date.now() - started };
    await sleep(250);
  }
  const bodyText = await page.evaluate('document.body?.innerText?.slice(0, 1000) ?? ""').catch(() => '');
  return { found: false, waited_ms: timeoutMs, body_text_sample: bodyText };
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
