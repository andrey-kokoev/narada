#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SECRET_NAME = 'CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_TOKEN';
const args = process.argv.slice(2);
const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const packageRoot = resolve(scriptDir, '..');
const repoRoot = resolve(packageRoot, '../..');
loadLocalEnv(join(repoRoot, '.env'));

const tokenFile = option('--token-file') ?? process.env.CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_TOKEN_FILE ?? '';
const tokenValue = option('--token') ?? process.env.CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_TOKEN_VALUE ?? (tokenFile ? readTokenFile(tokenFile) : '');
const configPath = option('--config') ?? 'wrangler.toml';

if (!tokenValue) throw new Error('repository_publication_secret_put_requires_--token_or_--token-file_or_CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_TOKEN_VALUE');
assert.doesNotMatch(tokenValue, /\s/, 'repository publication GitHub token must not contain whitespace');

const result = await putSecret({ secretName: SECRET_NAME, tokenValue, configPath });
if (result.exitCode !== 0) {
  throw new Error(`repository_publication_secret_put_failed:${result.exitCode}`);
}

process.stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_carrier.repository_publication_secret_put.v1',
  status: 'ok',
  secret_name: SECRET_NAME,
  config_path: configPath,
  token_source: tokenFile ? 'token_file' : 'explicit_token_value',
}, null, 2)}\n`);

function putSecret({ secretName, tokenValue, configPath }) {
  return new Promise((resolvePromise) => {
    const child = spawn('wrangler', ['secret', 'put', secretName, '--config', configPath], {
      cwd: packageRoot,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (exitCode) => {
      const sanitizedStdout = redactToken(stdout, tokenValue).trim();
      const sanitizedStderr = redactToken(stderr, tokenValue).trim();
      if (sanitizedStdout) process.stderr.write(`${sanitizedStdout}\n`);
      if (sanitizedStderr) process.stderr.write(`${sanitizedStderr}\n`);
      resolvePromise({ exitCode });
    });
    child.stdin.end(`${tokenValue}\n`);
  });
}

function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function readTokenFile(tokenFilePath) {
  const resolved = isAbsolute(tokenFilePath) ? tokenFilePath : join(repoRoot, tokenFilePath);
  if (!existsSync(resolved)) throw new Error(`repository_publication_secret_put_token_file_missing:${resolved}`);
  return readFileSync(resolved, 'utf8').trim();
}

function loadLocalEnv(envPath) {
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function redactToken(value, tokenValue) {
  return String(value ?? '').split(tokenValue).join('[redacted]');
}
