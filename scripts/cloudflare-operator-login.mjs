#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { stderr, stdout } from 'node:process';

const args = process.argv.slice(2);
const repoRoot = new URL('..', import.meta.url);
const envPath = new URL('.env', repoRoot);
const require = createRequire(import.meta.url);

loadLocalEnv(envPath);

if (flag('--help') || flag('-h')) {
  printHelp();
  process.exit(0);
}

const workerUrl = trimTrailingSlash(option('--url') ?? process.env.CLOUDFLARE_CARRIER_URL ?? '');
const cookieFile = option('--cookie-file') ?? option('--operator-cookie-file') ?? process.env.CLOUDFLARE_OPERATOR_COOKIE_FILE ?? defaultCookieFile();
const host = option('--host') ?? '127.0.0.1';
const port = Number(option('--port') ?? 0);
const timeoutMs = Number(option('--timeout-ms') ?? 180000);
const shouldOpen = !flag('--no-open');
const shouldWriteEnv = !flag('--no-write-env');
const shouldCheck = !flag('--skip-check');

if (!workerUrl) fail('cloudflare_operator_login_requires_--url_or_CLOUDFLARE_CARRIER_URL');

const capture = await captureOperatorCookie({ workerUrl, cookieFile, host, port, timeoutMs, shouldOpen });
if (shouldWriteEnv) await upsertLocalEnv({ CLOUDFLARE_OPERATOR_COOKIE_FILE: cookieFile });

let check = null;
if (shouldCheck) {
  check = await runJsonCommand('cloudflare-operator-check:human-session', [
    'pnpm',
    'cloudflare:operator:check',
    '--',
    '--operator-cookie-file',
    cookieFile,
    '--require-operator-session',
  ]);
}

stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_operator_login.v1',
  status: 'ok',
  worker_url: workerUrl,
  cookie_file: cookieFile,
  env_file_updated: shouldWriteEnv,
  opened_browser: shouldOpen,
  principal_id: capture.principal_id,
  email: capture.email,
  operator_check: check ? {
    status: check.status,
    human_operator_login_ready: check.human_operator_login_ready,
    human_operator_membership_ready: check.human_operator_membership_ready,
    console_url: check.console_url,
    microsoft_login_url: check.microsoft_login_url,
  } : null,
}, null, 2)}\n`);

async function captureOperatorCookie({ workerUrl, cookieFile, host, port, timeoutMs, shouldOpen }) {
  await mkdir(dirname(cookieFile), { recursive: true });
  const server = createServer();
  const captured = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      server.close();
      reject(new Error('operator_cookie_capture_timed_out'));
    }, timeoutMs);
    server.on('request', async (request, response) => {
      try {
        const url = new URL(request.url ?? '/', `http://${host}`);
        if (url.pathname !== '/capture') {
          response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
          response.end('not found');
          return;
        }
        const cookie = url.searchParams.get('cookie') ?? '';
        if (!cookie) throw new Error('operator_cookie_capture_missing_cookie');
        await writeFile(cookieFile, `narada_operator_session=${cookie}`, 'utf8');
        clearTimeout(timer);
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        response.end('<!doctype html><title>Narada operator session captured</title><p>Narada operator session captured. You can close this tab.</p>');
        resolve({
          principal_id: url.searchParams.get('principal_id') ?? null,
          email: url.searchParams.get('email') ?? null,
        });
        server.close();
      } catch (error) {
        clearTimeout(timer);
        response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
        response.end('operator session capture failed');
        reject(error);
        server.close();
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  const localCaptureUrl = `http://${host}:${address.port}/capture`;
  const captureUrl = new URL('/auth/operator/session-capture', withTrailingSlash(workerUrl));
  captureUrl.searchParams.set('return_to', localCaptureUrl);
  stderr.write(`Open this URL to sign in and capture the Narada operator session:\n${captureUrl.toString()}\n`);
  if (shouldOpen) await openBrowser(captureUrl.toString());
  return captured;
}

async function openBrowser(url) {
  const command = process.platform === 'win32'
    ? ['cmd.exe', ['/c', 'start', '', url]]
    : process.platform === 'darwin'
      ? ['open', [url]]
      : ['xdg-open', [url]];
  await new Promise((resolve) => {
    const child = spawn(command[0], command[1], { windowsHide: true, detached: true, stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('close', () => resolve(true));
    child.unref?.();
    setTimeout(() => resolve(true), 500);
  });
}

async function upsertLocalEnv(entries) {
  const existing = existsSync(envPath) ? await readFile(envPath, 'utf8') : '';
  const lines = existing.split(/\r?\n/).filter((line, index, all) => index < all.length - 1 || line.length > 0);
  const keys = new Set(Object.keys(entries));
  const next = lines.map((line) => {
    const match = /^\s*([A-Z0-9_]+)\s*=/.exec(line);
    if (!match || !keys.has(match[1])) return line;
    keys.delete(match[1]);
    return `${match[1]}=${entries[match[1]]}`;
  });
  for (const key of keys) next.push(`${key}=${entries[key]}`);
  await writeFile(envPath, `${next.join('\n')}\n`, 'utf8');
}

async function runJsonCommand(label, command) {
  stderr.write(`[cloudflare:operator:login] ${label}\n`);
  const result = await spawnCapture(command[0], command.slice(1));
  if (result.code !== 0) {
    fail('cloudflare_operator_login_check_failed', {
      label,
      exit_code: result.code,
      stderr: tail(result.stderr),
      stdout: tail(result.stdout),
    });
  }
  return parseJsonObject(result.stdout);
}

function spawnCapture(command, commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: fileURLToPath(repoRoot),
      shell: process.platform === 'win32',
      env: process.env,
      windowsHide: true,
    });
    let childStdout = '';
    let childStderr = '';
    child.stdout.on('data', (chunk) => {
      childStdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      childStderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout: childStdout, stderr: childStderr }));
  });
}

function parseJsonObject(output) {
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('json_object_not_found');
  return JSON.parse(output.slice(start, end + 1));
}

function loadLocalEnv(pathUrl) {
  if (!existsSync(pathUrl)) return;
  const text = require('node:fs').readFileSync(pathUrl, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = unquoteEnvValue(value);
  }
}

function defaultCookieFile() {
  if (process.platform === 'win32') return 'D:\\tmp\\narada-cloudflare-operator-cookie.txt';
  return join(tmpdir(), 'narada-cloudflare-operator-cookie.txt');
}

function option(name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  return args[index + 1] ?? null;
}

function flag(name) {
  return args.includes(name);
}

function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, '');
}

function withTrailingSlash(value) {
  return String(value).endsWith('/') ? value : `${value}/`;
}

function unquoteEnvValue(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  return value;
}

function tail(value, length = 1200) {
  return String(value ?? '').slice(-length);
}

function fail(code, detail = {}) {
  stderr.write(`${JSON.stringify({ ok: false, code, ...detail }, null, 2)}\n`);
  process.exit(1);
}

function printHelp() {
  stdout.write(`Narada Cloudflare operator login\n\nCommand:\n  pnpm cloudflare:operator:login\n\nConfiguration:\n  --url <worker-url> or CLOUDFLARE_CARRIER_URL\n  --cookie-file <path> or CLOUDFLARE_OPERATOR_COOKIE_FILE\n  --no-open prints the capture URL without opening a browser\n  --skip-check stores the cookie without running cloudflare:operator:check\n  --no-write-env avoids updating the ignored root .env file\n\nEffect:\n  Starts a short-lived local loopback capture server.\n  Opens the Worker Microsoft login/capture URL.\n  Stores only the signed narada_operator_session cookie in the local cookie file.\n  Updates CLOUDFLARE_OPERATOR_COOKIE_FILE in the ignored root .env file unless --no-write-env is supplied.\n  Runs pnpm cloudflare:operator:check -- --operator-cookie-file <path> --require-operator-session unless --skip-check is supplied.\n`);
}
