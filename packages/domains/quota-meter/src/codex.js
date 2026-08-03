import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { asNumber, durationToLabel, percentFromValues, toIso } from './core.js';

const DEFAULT_TIMEOUT_MS = 15_000;

export function resolveCodexCommand(
  env = process.env,
  platform = process.platform,
  executablePath = process.execPath,
  fileExists = existsSync,
) {
  const configured = typeof env.CODEX_COMMAND === 'string' ? env.CODEX_COMMAND.trim() : '';
  if (configured) return configured;

  // Fnm and other Node version managers commonly install the `codex.cmd`
  // shim beside the active node executable, while MCP hosts may provide a
  // reduced PATH that does not include that directory.
  if (platform === 'win32') {
    const siblingCommand = path.join(path.dirname(executablePath), 'codex.cmd');
    if (fileExists(siblingCommand)) return siblingCommand;
  }

  return 'codex';
}

function spawnOptions() {
  return {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    shell: process.platform === 'win32',
  };
}

class JsonRpcClient {
  constructor(child, timeoutMs) {
    this.child = child;
    this.timeoutMs = timeoutMs;
    this.nextId = 1;
    this.pending = new Map();
    this.stderr = '';
    this.lines = readline.createInterface({ input: child.stdout });

    this.lines.on('line', (line) => {
      if (!line.trim()) return;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }

      if (message.id === undefined || message.id === null) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);

      if (message.error) {
        const error = new Error(message.error.message || 'Codex app-server request failed');
        error.code = message.error.code;
        pending.reject(error);
      } else {
        pending.resolve(message.result ?? message);
      }
    });

    child.stderr.on('data', (chunk) => {
      this.stderr = `${this.stderr}${chunk}`.slice(-4_000);
    });

    child.on('error', (error) => this.rejectAll(error));
    child.on('exit', (code, signal) => {
      if (this.pending.size === 0) return;
      const error = new Error(`Codex app-server exited (${signal || code})`);
      error.code = 'CODEX_APP_SERVER_EXITED';
      this.rejectAll(error);
    });
  }

  rejectAll(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  request(method, params) {
    const id = this.nextId++;
    const message = { method, id };
    if (params !== undefined) message.params = params;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        const error = new Error(`Timed out waiting for Codex method ${method}`);
        error.code = 'CODEX_TIMEOUT';
        reject(error);
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify(message)}\n`);
    });
  }

  notify(method, params) {
    const message = { method };
    if (params !== undefined) message.params = params;
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  close() {
    this.lines.close();
    if (!this.child.killed) this.child.kill();
  }
}

function normalizeRateLimits(result, fetchedAt) {
  const source = result?.rateLimits ?? result ?? {};
  const windows = [];

  for (const [key, value] of Object.entries(source)) {
    if (!value || typeof value !== 'object') continue;
    const percent = percentFromValues({
      usedPercent: value.usedPercent ?? value.used_percent,
      remainingPercent: value.remainingPercent ?? value.remaining_percent,
    });
    const durationMinutes = asNumber(value.windowDurationMins ?? value.window_duration_mins);
    const durationSeconds = durationMinutes === null ? null : durationMinutes * 60;
    if (percent.usedPercent === null && value.resetsAt === undefined && value.resets_at === undefined) continue;

    windows.push({
      id: `codex:${key}`,
      label: durationToLabel(durationSeconds, key),
      usedPercent: percent.usedPercent,
      remainingPercent: percent.remainingPercent,
      resetAt: toIso(value.resetsAt ?? value.resets_at),
      durationSeconds,
      unit: 'percent',
      source: 'account/rateLimits/read',
      fetchedAt,
    });
  }

  return windows;
}

function authRequired(message = 'Codex is not logged in with a ChatGPT account.', fetchedAt = new Date().toISOString()) {
  return {
    provider: 'codex',
    displayName: 'Codex',
    status: 'auth_required',
    auth: { mode: 'unknown' },
    windows: [],
    usage: null,
    metadata: {},
    loginCommand: 'codex login',
    error: { code: 'AUTH_REQUIRED', message },
    fetchedAt,
    source: 'codex app-server',
  };
}

function looksLikeAuthError(error, detail = '') {
  const text = `${error?.code || ''} ${error?.message || ''} ${detail}`.toLowerCase();
  return /auth|login|credential|unauthori|not logged|requires openai/.test(text);
}

export async function fetchCodex(options = {}) {
  const fetchedAt = new Date().toISOString();
  const command = resolveCodexCommand(options.env || process.env);
  let child;
  let rpc;

  try {
    child = spawn(command, ['app-server', '--listen', 'stdio://'], spawnOptions());
    rpc = new JsonRpcClient(child, options.timeoutMs || DEFAULT_TIMEOUT_MS);

    try {
      await rpc.request('initialize', {
        clientInfo: {
          name: 'quota-meter',
          title: 'quota-meter',
          version: options.version || '0.1.0',
        },
      });
      rpc.notify('initialized');

      const account = await rpc.request('account/read', { refreshToken: false });
      const accountInfo = account?.account;
      if (!accountInfo) return authRequired(undefined, fetchedAt);
      if (accountInfo.type === 'apiKey') {
        return authRequired('Codex is using an API key; ChatGPT subscription limits require `codex login`.', fetchedAt);
      }

      const rateLimitsPromise = rpc.request('account/rateLimits/read');
      const usagePromise = rpc.request('account/usage/read').catch(() => null);
      const [rateLimits, usage] = await Promise.all([rateLimitsPromise, usagePromise]);
      const windows = normalizeRateLimits(rateLimits, fetchedAt);

      return {
        provider: 'codex',
        displayName: 'Codex',
        status: windows.length > 0 ? 'ok' : 'unavailable',
        auth: { mode: accountInfo.type, plan: accountInfo.planType || null },
        plan: accountInfo.planType || null,
        windows,
        usage,
        metadata: {
          rateLimitReachedType: rateLimits?.rateLimits?.rateLimitReachedType ?? rateLimits?.rateLimitReachedType ?? null,
          spendControlReached: rateLimits?.rateLimits?.spendControlReached ?? rateLimits?.spendControlReached ?? null,
          individualLimit: rateLimits?.rateLimits?.individualLimit ?? rateLimits?.individualLimit ?? null,
          rateLimitResetCredits: rateLimits?.rateLimitResetCredits ?? null,
        },
        fetchedAt,
        source: 'codex app-server',
      };
    } finally {
      rpc.close();
    }
  } catch (error) {
    const detail = rpc?.stderr?.trim().replace(/\s+/g, ' ') || '';
    const message = detail ? `${error.message}: ${detail}` : error.message;
    const unavailable = {
      provider: 'codex',
      displayName: 'Codex',
      status: error.code === 'AUTH_REQUIRED' || looksLikeAuthError(error, detail) ? 'auth_required' : 'unavailable',
      auth: { mode: 'unknown' },
      windows: [],
      usage: null,
      metadata: {},
      loginCommand: 'codex login',
      error: {
        code: error.code || 'CODEX_ERROR',
        message,
      },
      fetchedAt,
      source: 'codex app-server',
    };
    return unavailable;
  }
}