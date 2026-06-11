#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPOSITORY_PUBLICATION_GITHUB_APP_SECRET_NAMES = {
  appId: 'CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_ID',
  installationId: 'CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_INSTALLATION_ID',
  privateKey: 'CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_PRIVATE_KEY',
};

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const packageRoot = resolve(scriptDir, '..');
const repoRoot = resolve(packageRoot, '../..');

export function parseGithubAppSecretPutArgs(argv = [], env = process.env, roots = defaultRoots()) {
  const args = [...argv];
  loadLocalEnv(join(roots.repoRoot, '.env'), env);

  const configPath = option(args, '--config') ?? 'wrangler.toml';
  const appId = option(args, '--app-id') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_ID_VALUE ?? '';
  const installationId = option(args, '--installation-id') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_INSTALLATION_ID_VALUE ?? '';
  const privateKeyFile = option(args, '--private-key-file') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_PRIVATE_KEY_FILE ?? '';
  const privateKey = normalizePrivateKey(
    option(args, '--private-key')
      ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_PRIVATE_KEY_VALUE
      ?? (privateKeyFile ? readSecretFile(privateKeyFile, roots.repoRoot) : ''),
  );

  if (!appId) throw new Error('repository_publication_github_app_secret_put_requires_--app-id_or_CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_ID_VALUE');
  if (!installationId) throw new Error('repository_publication_github_app_secret_put_requires_--installation-id_or_CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_INSTALLATION_ID_VALUE');
  if (!privateKey) throw new Error('repository_publication_github_app_secret_put_requires_--private-key_or_--private-key-file_or_CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_PRIVATE_KEY_VALUE');
  assert.match(appId, /^\d+$/, 'repository publication GitHub App id must be numeric');
  assert.match(installationId, /^\d+$/, 'repository publication GitHub App installation id must be numeric');
  assert.match(privateKey, /-----BEGIN PRIVATE KEY-----/, 'repository publication GitHub App private key must be PKCS8 PEM');
  assert.match(privateKey, /-----END PRIVATE KEY-----/, 'repository publication GitHub App private key must be PKCS8 PEM');

  return {
    configPath,
    packageRoot: roots.packageRoot,
    secrets: [
      { secretName: REPOSITORY_PUBLICATION_GITHUB_APP_SECRET_NAMES.appId, value: appId, source: 'explicit_app_id' },
      { secretName: REPOSITORY_PUBLICATION_GITHUB_APP_SECRET_NAMES.installationId, value: installationId, source: 'explicit_installation_id' },
      { secretName: REPOSITORY_PUBLICATION_GITHUB_APP_SECRET_NAMES.privateKey, value: privateKey, source: privateKeyFile ? 'private_key_file' : 'explicit_private_key_value' },
    ],
  };
}

export async function installGithubAppSecrets(config, secretWriter = putSecret) {
  const installed = [];
  const redactions = config.secrets.map((entry) => entry.value);

  for (const secret of config.secrets) {
    const result = await secretWriter({
      secretName: secret.secretName,
      value: secret.value,
      configPath: config.configPath,
      packageRoot: config.packageRoot,
      redactions,
    });
    if (result.exitCode !== 0) {
      const error = new Error(`repository_publication_github_app_secret_put_failed:${secret.secretName}:${result.exitCode}`);
      error.code = 'repository_publication_github_app_secret_put_failed';
      error.secret_name = secret.secretName;
      error.exit_code = result.exitCode;
      error.stdout = result.stdout ?? '';
      error.stderr = result.stderr ?? '';
      error.spawn_error = result.spawnError ?? null;
      throw error;
    }
    installed.push({ secret_name: secret.secretName, source: secret.source });
  }

  return {
    schema: 'narada.cloudflare_carrier.repository_publication_github_app_secret_put.v1',
    status: 'ok',
    credential_mode: 'github_app_installation',
    config_path: config.configPath,
    installed,
  };
}

export function putSecret({ secretName, value, configPath, packageRoot: cwd = packageRoot, redactions = [] }) {
  return new Promise((resolvePromise) => {
    const wrangler = wranglerInvocation();
    const child = spawn(wrangler.command, [...wrangler.args, 'secret', 'put', secretName, '--config', configPath], {
      cwd,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      settled = true;
      resolvePromise({
        exitCode: 1,
        stdout: redactSecrets(stdout, redactions).trim(),
        stderr: redactSecrets(stderr, redactions).trim(),
        spawnError: error?.message ?? 'repository_publication_github_app_secret_put_spawn_failed',
      });
    });
    child.on('close', (exitCode) => {
      if (settled) return;
      const sanitizedStdout = redactSecrets(stdout, redactions).trim();
      const sanitizedStderr = redactSecrets(stderr, redactions).trim();
      if (sanitizedStdout) process.stderr.write(`${sanitizedStdout}\n`);
      if (sanitizedStderr) process.stderr.write(`${sanitizedStderr}\n`);
      resolvePromise({ exitCode, stdout: sanitizedStdout, stderr: sanitizedStderr, spawnError: null });
    });
    child.stdin.end(`${value}\n`);
  });
}

export function formatGithubAppSecretPutError(error) {
  return JSON.stringify({
    ok: false,
    code: error?.code ?? error?.message ?? 'repository_publication_github_app_secret_put_failed',
    message: error?.message ?? 'repository_publication_github_app_secret_put_failed',
    secret_name: error?.secret_name ?? null,
    exit_code: error?.exit_code ?? null,
    spawn_error: error?.spawn_error ?? null,
    stdout: error?.stdout ?? '',
    stderr: error?.stderr ?? '',
  }, null, 2);
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const config = parseGithubAppSecretPutArgs(argv, env);
  const result = await installGithubAppSecrets(config);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function readSecretFile(secretFilePath, root = repoRoot) {
  const resolved = isAbsolute(secretFilePath) ? secretFilePath : join(root, secretFilePath);
  if (!existsSync(resolved)) throw new Error(`repository_publication_github_app_secret_put_file_missing:${resolved}`);
  return readFileSync(resolved, 'utf8').trim();
}

function loadLocalEnv(envPath, env = process.env) {
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!env[key]) env[key] = value;
  }
}

function normalizePrivateKey(value) {
  return String(value ?? '').trim().replace(/\\n/g, '\n');
}

function redactSecrets(value, redactions) {
  let result = String(value ?? '');
  for (const secret of redactions.filter(Boolean)) result = result.split(secret).join('[redacted]');
  return result;
}

function wranglerInvocation() {
  const npmExecPath = process.env.npm_execpath ?? '';
  if (/\.[cm]?js$/i.test(npmExecPath)) return { command: process.execPath, args: [npmExecPath, 'exec', 'wrangler'] };
  if (npmExecPath) return { command: npmExecPath, args: ['exec', 'wrangler'] };
  return { command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args: ['exec', 'wrangler'] };
}

function defaultRoots() {
  return { packageRoot, repoRoot };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`${formatGithubAppSecretPutError(error)}\n`);
    process.exit(1);
  });
}
