#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const repoRoot = resolve(scriptDir, '../../..');
loadLocalEnv(join(repoRoot, '.env'));

const workerUrl = trimTrailingSlash(option('--url') ?? process.env.CLOUDFLARE_CARRIER_URL ?? '');
const tokenFile = option('--token-file') ?? process.env.CLOUDFLARE_CARRIER_TOKEN_FILE ?? '';
const bearerToken = option('--token') ?? (tokenFile ? readTokenFile(tokenFile) : process.env.CLOUDFLARE_CARRIER_TOKEN ?? '');
const siteId = option('--site') ?? process.env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_narada_cloudflare';
const repositoryRef = option('--repository-ref') ?? process.env.CLOUDFLARE_REPOSITORY_PUBLICATION_LIVE_REPOSITORY_REF ?? 'github:andrey-kokoev/narada';
const branchRef = option('--branch') ?? process.env.CLOUDFLARE_REPOSITORY_PUBLICATION_LIVE_BRANCH ?? 'cloudflare-publication';
const requireGithubApp = args.includes('--require-github-app') || process.env.CLOUDFLARE_REPOSITORY_PUBLICATION_REQUIRE_GITHUB_APP === '1';
const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

if (!workerUrl) throw new Error('repository_publication_readiness_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
if (!bearerToken) throw new Error('repository_publication_readiness_live_smoke_requires_--token_or_--token-file_or_CLOUDFLARE_CARRIER_TOKEN');
if (!siteId) throw new Error('repository_publication_readiness_live_smoke_requires_site_id');
if (!repositoryRef) throw new Error('repository_publication_readiness_live_smoke_requires_repository_ref');
if (!branchRef) throw new Error('repository_publication_readiness_live_smoke_requires_branch_ref');

const readiness = await postCarrier({
  operation: 'repository_publication.cloudflare_execution.readiness',
  request_id: `repository_publication_cloudflare_github_readiness_live_${suffix}`,
  params: { site_id: siteId, repository_ref: repositoryRef, branch_ref: branchRef },
});
assert.equal(readiness.http_status, 200, JSON.stringify(readiness.body));
assert.equal(readiness.body.schema, 'narada.sonar.cloudflare_github_repository_publication_readiness.v1');
assert.equal(readiness.body.status, 'ok');
assert.equal(readiness.body.site_id, siteId);
assert.equal(readiness.body.repository_publication_executor_authority, 'cloudflare_github_repository_publication_executor');
assert.equal(readiness.body.repository_publication_admission_authority, 'cloudflare_repository_publication_admission_controller');
assert.equal(readiness.body.github_token_secret_ref, 'CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_TOKEN');
assert.ok(['github_token', 'github_app_installation', 'missing'].includes(readiness.body.github_credential_mode), JSON.stringify(readiness.body));
assert.equal(typeof readiness.body.github_app_configured, 'boolean', JSON.stringify(readiness.body));
assert.equal(readiness.body.cloudflare_git_push_admission, 'not_admitted');
assert.ok(['ready', 'not_ready'].includes(readiness.body.readiness_status), JSON.stringify(readiness.body));
assert.ok(Array.isArray(readiness.body.missing_configuration), JSON.stringify(readiness.body));
assert.doesNotMatch(JSON.stringify(readiness.body), /gh[pousr]_[A-Za-z0-9_]+/);

if (requireGithubApp) {
  assert.equal(readiness.body.readiness_status, 'ready', JSON.stringify(readiness.body));
  assert.equal(readiness.body.github_credential_mode, 'github_app_installation', JSON.stringify(readiness.body));
  assert.equal(readiness.body.github_app_configured, true, JSON.stringify(readiness.body));
}

process.stdout.write(`${JSON.stringify({
  schema: 'narada.cloudflare_carrier.repository_publication_readiness_live_smoke.v1',
  status: readiness.body.readiness_status,
  worker_url: workerUrl,
  site_id: siteId,
  repository_ref: repositoryRef,
  branch_ref: readiness.body.requested_branch_ref,
  repository_publication_executor_authority: readiness.body.repository_publication_executor_authority,
  repository_publication_admission_authority: readiness.body.repository_publication_admission_authority,
  github_credential_mode: readiness.body.github_credential_mode,
  github_token_configured: readiness.body.github_token_configured,
  github_token_secret_ref: readiness.body.github_token_secret_ref,
  github_app_configured: readiness.body.github_app_configured,
  github_app_required: requireGithubApp,
  allowed_repository_count: readiness.body.allowed_repository_count,
  allowed_branch_count: readiness.body.allowed_branch_count,
  requested_repository_allowed: readiness.body.requested_repository_allowed,
  requested_branch_allowed: readiness.body.requested_branch_allowed,
  missing_configuration: readiness.body.missing_configuration,
  cloudflare_git_push_admission: readiness.body.cloudflare_git_push_admission,
  direct_cloudflare_repository_mutation_admission: readiness.body.direct_cloudflare_repository_mutation_admission,
  authority_partition: readiness.body.authority_partition,
}, null, 2)}\n`);

async function postCarrier(body) {
  const response = await fetch(`${workerUrl}/api/carrier`, {
    method: 'POST',
    headers: { authorization: `Bearer ${bearerToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { http_status: response.status, body: await response.json().catch(() => ({})) };
}

function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function readTokenFile(tokenFilePath) {
  const resolved = isAbsolute(tokenFilePath) ? tokenFilePath : join(repoRoot, tokenFilePath);
  if (!existsSync(resolved)) throw new Error(`repository_publication_readiness_live_smoke_token_file_missing:${resolved}`);
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

function trimTrailingSlash(value) {
  return String(value ?? '').replace(/\/+$/, '');
}
