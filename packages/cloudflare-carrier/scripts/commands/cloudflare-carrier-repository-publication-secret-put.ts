#!/usr/bin/env node
import assert from 'node:assert/strict';
import { runGovernedCommand } from '@narada2/process-launch-posture';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPOSITORY_PUBLICATION_SECRET_NAME = 'CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_TOKEN';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const packageRoot = resolve(scriptDir, '../..');
const repoRoot = resolve(packageRoot, '../..');

export function parseRepositoryPublicationSecretPutArgs(argv: any= [], env: any= process.env, roots: any= defaultRoots()) {
  const args = [...argv];
  loadLocalEnv(join(roots.repoRoot, '.env'), env);

  const format = option(args, '--format') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_SECRET_PUT_FORMAT ?? 'json';
  const tokenFile = option(args, '--token-file') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_TOKEN_FILE ?? '';
  const fromGhAuth = args.includes('--from-gh-auth') || env.CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_TOKEN_FROM_GH_AUTH === '1';
  const tokenValue = option(args, '--token')
    ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_TOKEN_VALUE
    ?? (tokenFile ? readTokenFile(tokenFile, roots.repoRoot) : fromGhAuth ? null : '');
  const configPath = option(args, '--config') ?? 'wrangler.toml';

  if (!['json', 'text'].includes(format)) throw new Error(`repository_publication_secret_put_unknown_format:${format}`);

  return {
    format,
    tokenFile,
    tokenValue,
    fromGhAuth,
    configPath,
    packageRoot: roots.packageRoot,
    repoRoot: roots.repoRoot,
  };
}

export function formatRepositoryPublicationSecretPutText(result: any) {
  const lines = [
    `Repository Publication Secret Put: ${result.status}`,
    `Secret: ${result.secret_name}`,
    `Config: ${result.config_path}`,
    `Token Source: ${result.token_source}`,
  ];
  return `${lines.join('\n')}\n`;
}

export async function runRepositoryPublicationSecretPut(config: any, { secretWriter = putSecret, ghAuthReader = readGhAuthToken }: any= {}) {
  const tokenValue = config.tokenValue ?? (config.fromGhAuth ? await ghAuthReader(config.repoRoot) : '');
  if (!tokenValue) {
    throw new Error('repository_publication_secret_put_requires_--token_or_--token-file_or_CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_TOKEN_VALUE');
  }
  assert.doesNotMatch(tokenValue, /\s/, 'repository publication GitHub token must not contain whitespace');

  const result = await secretWriter({
    secretName: REPOSITORY_PUBLICATION_SECRET_NAME,
    tokenValue,
    configPath: config.configPath,
    packageRoot: config.packageRoot,
  });
  if (result.exitCode !== 0) {
    const error: any = new Error(`repository_publication_secret_put_failed:${result.exitCode}`);
    error.code = 'repository_publication_secret_put_failed';
    error.exit_code = result.exitCode;
    throw error;
  }

  return {
    schema: 'narada.cloudflare_carrier.repository_publication_secret_put.v1',
    status: 'ok',
    secret_name: REPOSITORY_PUBLICATION_SECRET_NAME,
    config_path: config.configPath,
    token_source: config.tokenFile ? 'token_file' : config.fromGhAuth ? 'gh_auth_keyring' : 'explicit_token_value',
  };
}

export function putSecret({ secretName, tokenValue, configPath, packageRoot: cwd = packageRoot }: any) {
  return new Promise((resolvePromise: any) => {
    const pnpm = pnpmInvocation();
    const child: any = runGovernedCommand(pnpm.command, [...pnpm.args, 'exec', 'wrangler', 'secret', 'put', secretName, '--config', configPath], {
      cwd,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: any) => { stdout += chunk; });
    child.stderr.on('data', (chunk: any) => { stderr += chunk; });
    child.on('error', (error: any) => {
      stderr += error?.message ?? 'repository_publication_secret_put_spawn_failed';
      resolvePromise({ exitCode: 1 });
    });
    child.on('close', (exitCode: any) => {
      const sanitizedStdout = redactToken(stdout, tokenValue).trim();
      const sanitizedStderr = redactToken(stderr, tokenValue).trim();
      if (sanitizedStdout) process.stderr.write(`${sanitizedStdout}\n`);
      if (sanitizedStderr) process.stderr.write(`${sanitizedStderr}\n`);
      resolvePromise({ exitCode });
    });
    child.stdin.end(`${tokenValue}\n`);
  });
}

function pnpmInvocation() {
  const npmExecPath = process.env.npm_execpath ?? '';
  if (/\.[cm]?js$/i.test(npmExecPath)) return { command: process.execPath, args: [npmExecPath] };
  if (npmExecPath) return { command: npmExecPath, args: [] };
  return { command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args: [] };
}

function option(args: any, name: any) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function readTokenFile(tokenFilePath: any, root: any= repoRoot) {
  const resolved = isAbsolute(tokenFilePath) ? tokenFilePath : join(root, tokenFilePath);
  if (!existsSync(resolved)) throw new Error(`repository_publication_secret_put_token_file_missing:${resolved}`);
  return readFileSync(resolved, 'utf8').trim();
}

export function readGhAuthToken(cwd: any= repoRoot) {
  return new Promise((resolvePromise: any, reject: any) => {
    const child: any = runGovernedCommand('gh', ['auth', 'token'], {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: any) => { stdout += chunk; });
    child.stderr.on('data', (chunk: any) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (exitCode: any) => {
      if (exitCode !== 0) {
        reject(new Error(`repository_publication_secret_put_gh_auth_token_failed:${exitCode}:${stderr.trim()}`));
        return;
      }
      resolvePromise(stdout.trim());
    });
  });
}

function loadLocalEnv(envPath: any, env: any = process.env) {
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

function redactToken(value: any, tokenValue: any) {
  return String(value ?? '').split(tokenValue).join('[redacted]');
}

function defaultRoots() {
  return { packageRoot, repoRoot };
}

async function main(argv: any= process.argv.slice(2), env: any= process.env) {
  const config = parseRepositoryPublicationSecretPutArgs(argv, env);
  const result = await runRepositoryPublicationSecretPut(config);
  if (config.format=== 'text') {
    process.stdout.write(formatRepositoryPublicationSecretPutText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url)=== process.argv[1]) {
  await main();
}
