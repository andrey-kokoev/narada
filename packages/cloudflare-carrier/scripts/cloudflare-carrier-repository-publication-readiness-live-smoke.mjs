#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const repoRoot = resolve(scriptDir, '../../..');

export function parseRepositoryPublicationReadinessLiveSmokeArgs(argv = [], env = process.env, { loadEnv = true } = {}) {
  const args = [...argv];
  if (loadEnv) loadLocalEnv(join(repoRoot, '.env'), env);

  const workerUrl = trimTrailingSlash(option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '');
  const format = option(args, '--format') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_READINESS_LIVE_FORMAT ?? 'json';
  const siteId = option(args, '--site') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_narada_cloudflare';
  const repositoryRef = option(args, '--repository-ref') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_LIVE_REPOSITORY_REF ?? 'github:andrey-kokoev/narada';
  const branchRef = option(args, '--branch') ?? env.CLOUDFLARE_REPOSITORY_PUBLICATION_LIVE_BRANCH ?? 'cloudflare-publication';
  const requireGithubApp = flag(args, '--require-github-app') || env.CLOUDFLARE_REPOSITORY_PUBLICATION_REQUIRE_GITHUB_APP === '1';
  const auth = resolveAuth(args, env) ?? resolveBearerFromEnv(args, env);

  if (!workerUrl) throw new Error('repository_publication_readiness_live_smoke_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!['json', 'text'].includes(format)) throw new Error(`repository_publication_readiness_live_smoke_unknown_format:${format}`);
  if (!auth) throw new Error('repository_publication_readiness_live_smoke_requires_bearer_token_or_operator_session');
  if (!siteId) throw new Error('repository_publication_readiness_live_smoke_requires_site_id');
  if (!repositoryRef) throw new Error('repository_publication_readiness_live_smoke_requires_repository_ref');
  if (!branchRef) throw new Error('repository_publication_readiness_live_smoke_requires_branch_ref');

  return {
    workerUrl,
    format,
    auth,
    siteId,
    repositoryRef,
    branchRef,
    requireGithubApp,
  };
}

export function formatRepositoryPublicationReadinessLiveSmokeText(result) {
  const lines = [
    `Repository Publication Readiness Smoke: ${result.status}`,
    `Worker: ${result.worker_url}`,
    `Site: ${result.site_id}`,
    `Target: repository=${result.repository_ref} branch=${result.branch_ref}`,
    `Credential Mode: ${result.github_credential_mode ?? 'unknown'}`,
    `GitHub App Configured: ${String(result.github_app_configured)}`,
    `Readiness: cloudflare_git_push=${result.cloudflare_git_push_admission ?? 'unknown'} direct_mutation=${result.direct_cloudflare_repository_mutation_admission ?? 'unknown'}`,
    `Allowed Targets: repositories=${result.allowed_repository_count ?? 0} branches=${result.allowed_branch_count ?? 0}`,
    `Requested Target Allowed: repository=${String(result.requested_repository_allowed)} branch=${String(result.requested_branch_allowed)}`,
  ];
  if (Array.isArray(result.missing_configuration) && result.missing_configuration.length > 0) {
    lines.push(`Missing Configuration: ${result.missing_configuration.join(', ')}`);
  }
  lines.push(`Site Read: pnpm --filter @narada2/cloudflare-carrier product:site:read:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`);
  lines.push(`Site Next Workflow: pnpm --filter @narada2/cloudflare-carrier product:site:next:workflow:live:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file> --execute-site-next`);
  lines.push(`Provider Liveness: pnpm --filter @narada2/cloudflare-carrier product:repository-publication:provider-liveness:text -- --url ${result.worker_url} --site ${result.site_id} --operator-session-file <operator-session-file>`);
  return `${lines.join('\n')}\n`;
}

export async function runRepositoryPublicationReadinessLiveSmoke(config, fetchImpl = fetch) {
  const suffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const readiness = await postCarrier(config, {
    operation: 'repository_publication.cloudflare_execution.readiness',
    request_id: `repository_publication_cloudflare_github_readiness_live_${suffix}`,
    params: { site_id: config.siteId, repository_ref: config.repositoryRef, branch_ref: config.branchRef },
  }, fetchImpl);
  assert.equal(readiness.http_status, 200, JSON.stringify(readiness.body));
  assert.equal(readiness.body.schema, 'narada.sonar.cloudflare_github_repository_publication_readiness.v1');
  assert.equal(readiness.body.status, 'ok');
  assert.equal(readiness.body.site_id, config.siteId);
  assert.equal(readiness.body.repository_publication_executor_authority, 'cloudflare_github_repository_publication_executor');
  assert.equal(readiness.body.repository_publication_admission_authority, 'cloudflare_repository_publication_admission_controller');
  assert.equal(readiness.body.github_token_secret_ref, 'CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_TOKEN');
  assert.ok(['github_token', 'github_app_installation', 'missing'].includes(readiness.body.github_credential_mode), JSON.stringify(readiness.body));
  assert.equal(typeof readiness.body.github_app_configured, 'boolean', JSON.stringify(readiness.body));
  assert.equal(readiness.body.cloudflare_git_push_admission, 'not_admitted');
  assert.ok(['ready', 'not_ready'].includes(readiness.body.readiness_status), JSON.stringify(readiness.body));
  assert.ok(Array.isArray(readiness.body.missing_configuration), JSON.stringify(readiness.body));
  assert.doesNotMatch(JSON.stringify(readiness.body), /gh[pousr]_[A-Za-z0-9_]+/);

  if (config.requireGithubApp) {
    assert.equal(readiness.body.readiness_status, 'ready', JSON.stringify(readiness.body));
    assert.equal(readiness.body.github_credential_mode, 'github_app_installation', JSON.stringify(readiness.body));
    assert.equal(readiness.body.github_app_configured, true, JSON.stringify(readiness.body));
  }

  return {
    schema: 'narada.cloudflare_carrier.repository_publication_readiness_live_smoke.v1',
    status: readiness.body.readiness_status,
    worker_url: config.workerUrl,
    auth_source: config.auth.source,
    site_id: config.siteId,
    repository_ref: config.repositoryRef,
    branch_ref: readiness.body.requested_branch_ref,
    repository_publication_executor_authority: readiness.body.repository_publication_executor_authority,
    repository_publication_admission_authority: readiness.body.repository_publication_admission_authority,
    github_credential_mode: readiness.body.github_credential_mode,
    github_token_configured: readiness.body.github_token_configured,
    github_token_secret_ref: readiness.body.github_token_secret_ref,
    github_app_configured: readiness.body.github_app_configured,
    github_app_required: config.requireGithubApp,
    allowed_repository_count: readiness.body.allowed_repository_count,
    allowed_branch_count: readiness.body.allowed_branch_count,
    requested_repository_allowed: readiness.body.requested_repository_allowed,
    requested_branch_allowed: readiness.body.requested_branch_allowed,
    missing_configuration: readiness.body.missing_configuration,
    cloudflare_git_push_admission: readiness.body.cloudflare_git_push_admission,
    direct_cloudflare_repository_mutation_admission: readiness.body.direct_cloudflare_repository_mutation_admission,
    authority_partition: readiness.body.authority_partition,
  };
}

async function postCarrier(config, body, fetchImpl) {
  const response = await fetchImpl(`${config.workerUrl}/api/carrier`, {
    method: 'POST',
    headers: { ...authHeaders(config.auth), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { http_status: response.status, body: await response.json().catch(() => ({})) };
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function flag(args, name) {
  return args.includes(name);
}

function resolveBearerFromEnv(args, env) {
  const tokenFile = option(args, '--token-file') ?? env.CLOUDFLARE_CARRIER_TOKEN_FILE ?? '';
  const bearerToken = option(args, '--token') ?? (tokenFile ? readTokenFile(tokenFile) : env.CLOUDFLARE_CARRIER_TOKEN ?? '');
  const trimmed = String(bearerToken ?? '').trim();
  return trimmed ? { kind: 'bearer', value: trimmed, source: option(args, '--token') ? 'flag:--token' : (tokenFile ? 'flag:--token-file_or_env:CLOUDFLARE_CARRIER_TOKEN_FILE' : 'env:CLOUDFLARE_CARRIER_TOKEN') } : null;
}

function readTokenFile(tokenFilePath) {
  const resolved = isAbsolute(tokenFilePath) ? tokenFilePath : join(repoRoot, tokenFilePath);
  if (!existsSync(resolved)) throw new Error(`repository_publication_readiness_live_smoke_token_file_missing:${resolved}`);
  return readFileSync(resolved, 'utf8').trim();
}

function loadLocalEnv(envPath, targetEnv = process.env) {
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^[\"']|[\"']$/g, '');
    if (!targetEnv[key]) targetEnv[key] = value;
  }
}

function trimTrailingSlash(value) {
  return String(value ?? '').replace(/\/+$/, '');
}

if (resolve(process.argv[1] ?? '') === scriptPath) {
  const config = parseRepositoryPublicationReadinessLiveSmokeArgs(process.argv.slice(2));
  const result = await runRepositoryPublicationReadinessLiveSmoke(config);
  if (config.format === 'text') {
    process.stdout.write(formatRepositoryPublicationReadinessLiveSmokeText(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}
