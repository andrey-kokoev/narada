#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const packageRoot = resolve(scriptDir, '..');
const repoRoot = resolve(packageRoot, '../..');
loadLocalEnv(join(repoRoot, '.env'));

const appId = option('--app-id') ?? process.env.CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_ID_VALUE ?? '';
const installationId = option('--installation-id') ?? process.env.CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_INSTALLATION_ID_VALUE ?? '';
const privateKeyFile = option('--private-key-file') ?? process.env.CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_PRIVATE_KEY_FILE ?? '';
const privateKey = normalizePrivateKey(option('--private-key') ?? process.env.CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_PRIVATE_KEY_VALUE ?? (privateKeyFile ? readSecretFile(privateKeyFile) : ''));

const checks = [
  checkPresence('app_id', 'CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_ID_VALUE', appId),
  checkPresence('installation_id', 'CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_INSTALLATION_ID_VALUE', installationId),
  {
    name: 'private_key',
    source_env: privateKeyFile
      ? 'CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_PRIVATE_KEY_FILE'
      : 'CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_PRIVATE_KEY_VALUE',
    present: Boolean(privateKey),
  },
];

const missing = checks.filter((check) => !check.present).map((check) => check.name);
const errors = [];
if (appId && !/^\d+$/.test(appId)) errors.push('github_app_id_must_be_numeric');
if (installationId && !/^\d+$/.test(installationId)) errors.push('github_app_installation_id_must_be_numeric');
if (privateKey && !/-----BEGIN PRIVATE KEY-----/.test(privateKey)) errors.push('github_app_private_key_must_be_pkcs8_pem_begin');
if (privateKey && !/-----END PRIVATE KEY-----/.test(privateKey)) errors.push('github_app_private_key_must_be_pkcs8_pem_end');

const status = missing.length === 0 && errors.length === 0 ? 'ready' : 'not_ready';
const result = {
  schema: 'narada.cloudflare_carrier.repository_publication_github_app_secret_preflight.v1',
  status,
  credential_mode: 'github_app_installation',
  checks,
  missing,
  errors,
  next_script: 'repository-publication:github-app-secret-put:live',
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (status !== 'ready') process.exitCode = 1;

function checkPresence(name, sourceEnv, value) {
  return { name, source_env: sourceEnv, present: Boolean(value) };
}

function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function readSecretFile(secretFilePath) {
  const resolved = isAbsolute(secretFilePath) ? secretFilePath : join(repoRoot, secretFilePath);
  if (!existsSync(resolved)) return '';
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
