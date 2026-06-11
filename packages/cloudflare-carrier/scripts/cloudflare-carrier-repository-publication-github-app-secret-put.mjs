#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SECRET_NAMES = {
  appId: 'CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_ID',
  installationId: 'CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_INSTALLATION_ID',
  privateKey: 'CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_PRIVATE_KEY',
};

const args = process.argv.slice(2);
const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const packageRoot = resolve(scriptDir, '..');
const repoRoot = resolve(packageRoot, '../..');
loadLocalEnv(join(repoRoot, '.env'));

const configPath = option('--config') ?? 'wrangler.toml';
const appId = option('--app-id') ?? process.env.CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_ID_VALUE ?? '';
const installationId = option('--installation-id') ?? process.env.CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_INSTALLATION_ID_VALUE ?? '';
const privateKeyFile = option('--private-key-file') ?? process.env.CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_PRIVATE_KEY_FILE ?? '';
const privateKey = normalizePrivateKey(option('--private-key') ?? process.env.CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_PRIVATE_KEY_VALUE ?? (privateKeyFile ? readSecretFile(privateKeyFile) : ''));

if (!appId) throw new Error('repository_publication_github_app_secret_put_requires_--app-id_or_CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_ID_VALUE');
if (!installationId) throw new Error('repository_publication_github_app_secret_put_requires_--installation-id_or_CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_INSTALLATION_ID_VALUE');
if (!privateKey) throw new Error('repository_publication_github_app_secret_put_requires_--private-key_or_--private-key-file_or_CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_PRIVATE_KEY_VALUE');
assert.match(appId, /^\d+$/, 'repository publication GitHub App id must be numeric');
assert.match(installationId, /^\d+$/, 'repository publication GitHub App installation id must be numeric');
assert.match(privateKey, /-----BEGIN PRIVATE KEY-----/, 'repository publication GitHub App private key must be PKCS8 PEM');
assert.match(privateKey, /-----END PRIVATE KEY-----/, 'repository publication GitHub App private key must be PKCS8 PEM');

const secrets = [
  { secretName: SECRET_NAMES.appId, value: appId, source: 'explicit_app_id' },
  { secretName: SECRET_NAMES.installationId, value: installationId, source: 'explicit_installation_id' },
  { secretName: SECRET_NAMES.privateKey, value: privateKey, source: privateKeyFile ? 'private_key_file' : 'explicit_private_key_value' },
];

const installed = [];
for (const secret of secrets) {
  const result = await putSecret({ secretName: secret.secretName, value: secret.value, configPath, redactions: secrets.map((entry) => entry.value) });
  if (result.exitCode !== 0) throw new Error(`repository_publication_github_app_secret_put_failed:${secret.secretName}:${result.exitCode}`);
  installed.push({ secret_name: secret.secretName, source: secret.source });
}

process.stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_carrier.repository_publication_github_app_secret_put.v1',
  status: 'ok',
  credential_mode: 'github_app_installation',
  config_path: configPath,
  installed,
}, null, 2)}\n`);

function putSecret({ secretName, value, configPath, redactions }) {
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
      const sanitizedStdout = redactSecrets(stdout, redactions).trim();
      const sanitizedStderr = redactSecrets(stderr, redactions).trim();
      if (sanitizedStdout) process.stderr.write(`${sanitizedStdout}\n`);
      if (sanitizedStderr) process.stderr.write(`${sanitizedStderr}\n`);
      resolvePromise({ exitCode });
    });
    child.stdin.end(`${value}\n`);
  });
}

function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function readSecretFile(secretFilePath) {
  const resolved = isAbsolute(secretFilePath) ? secretFilePath : join(repoRoot, secretFilePath);
  if (!existsSync(resolved)) throw new Error(`repository_publication_github_app_secret_put_file_missing:${resolved}`);
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

function normalizePrivateKey(value) {
  return String(value ?? '').trim().replace(/\\n/g, '\n');
}

function redactSecrets(value, redactions) {
  let result = String(value ?? '');
  for (const secret of redactions.filter(Boolean)) result = result.split(secret).join('[redacted]');
  return result;
}
