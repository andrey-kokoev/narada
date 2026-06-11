#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { projectCloudflareSiteRegistrySites } from '@narada2/cloudflare-site-registry';

const DEFAULT_OUTPUT_PATH = '.narada/site-registry/cloudflare-sites.json';

export async function materializeCloudflareSiteRegistryProjection({
  workerUrl,
  bearerToken,
  outputPath = DEFAULT_OUTPUT_PATH,
  dryRun = false,
  fetchImpl = fetch,
  now = () => new Date().toISOString(),
} = {}) {
  const normalizedWorkerUrl = trimTrailingSlash(workerUrl);
  if (!normalizedWorkerUrl) throw new Error('site_registry_projection_requires_worker_url');
  if (!bearerToken?.value) throw new Error('site_registry_projection_requires_bearer_token');

  const listed = await postCarrier({
    workerUrl: normalizedWorkerUrl,
    bearerToken: bearerToken.value,
    fetchImpl,
    body: {
      operation: 'site.list',
      request_id: `site_registry_projection_${requestTimestamp(now)}`,
      params: {},
    },
  });
  if (listed.http_status !== 200 || listed.body?.ok !== true) {
    return {
      schema: 'narada.cloudflare_site_registry.local_projection_materialization.v1',
      status: 'failed',
      reason: 'site_list_failed',
      http_status: listed.http_status,
      code: listed.body?.code ?? null,
      output_path: outputPath ?? null,
      worker_url: normalizedWorkerUrl,
      token_source: bearerToken.source,
      embeds_credentials: false,
      written: false,
    };
  }

  const generatedAt = now();
  const projected = projectCloudflareSiteRegistrySites(listed.body.sites ?? []);
  const projection = {
    schema: 'narada.cloudflare_site_registry.snapshot.v1',
    generated_at: generatedAt,
    source: 'cloudflare_carrier_site_list',
    source_operation: 'site.list',
    worker_url: normalizedWorkerUrl,
    site_count: projected.site_count,
    sites: projected.site_records,
    embeds_credentials: false,
  };

  if (!dryRun) {
    if (!outputPath) throw new Error('site_registry_projection_requires_output_path');
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(projection, null, 2)}\n`, 'utf8');
  }

  return {
    schema: 'narada.cloudflare_site_registry.local_projection_materialization.v1',
    status: 'ok',
    dry_run: dryRun,
    worker_url: normalizedWorkerUrl,
    token_source: bearerToken.source,
    embeds_credentials: false,
    output_path: outputPath ?? null,
    written: !dryRun,
    projection,
  };
}

export async function runCloudflareSiteRegistryProjectionCli(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(scriptDir, '../../..');
  const inputs = resolveCloudflareSiteRegistryProjectionInputs({ args, env, repoRoot });
  const result = await materializeCloudflareSiteRegistryProjection(inputs);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== 'ok') process.exitCode = 1;
  return result;
}

export function resolveCloudflareSiteRegistryProjectionInputs({ args = {}, env = process.env, repoRoot = process.cwd() } = {}) {
  loadLocalEnv(resolvePath(repoRoot, args.envPath ?? '.env'), env);
  return {
    workerUrl: args.workerUrl ?? env.CLOUDFLARE_CARRIER_URL ?? '',
    bearerToken: resolveBearerToken({ args, env, repoRoot }),
    outputPath: resolvePath(repoRoot, args.outputPath ?? env.NARADA_CLOUDFLARE_SITE_REGISTRY_PROJECTION ?? DEFAULT_OUTPUT_PATH),
    dryRun: args.dryRun,
  };
}

async function postCarrier({ workerUrl, bearerToken, body, fetchImpl }) {
  const response = await fetchImpl(`${workerUrl}/api/carrier`, {
    method: 'POST',
    headers: { authorization: `Bearer ${bearerToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  return { http_status: response.status, body: parsed };
}

function resolveBearerToken({ args, env, repoRoot }) {
  if (args.token) return { value: args.token, source: 'flag:--token' };
  const tokenFile = args.tokenFile ?? env.CLOUDFLARE_CARRIER_TOKEN_FILE ?? null;
  if (tokenFile) return { value: readTokenFile(resolvePath(repoRoot, tokenFile)), source: 'token-file' };
  if (env.CLOUDFLARE_CARRIER_TOKEN) return { value: env.CLOUDFLARE_CARRIER_TOKEN, source: 'env:CLOUDFLARE_CARRIER_TOKEN' };
  return null;
}

function readTokenFile(tokenFilePath) {
  if (!existsSync(tokenFilePath)) throw new Error(`site_registry_projection_token_file_missing:${tokenFilePath}`);
  return readFileSync(tokenFilePath, 'utf8').trim();
}

function loadLocalEnv(envPath, env) {
  if (!envPath || !existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = stripEnvValueQuotes(trimmed.slice(eq + 1).trim());
    if (!env[key]) env[key] = value;
  }
}

function parseArgs(argv) {
  const args = { dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--live') args.dryRun = false;
    else if (arg === '--url') args.workerUrl = argv[++index];
    else if (arg === '--token') args.token = argv[++index];
    else if (arg === '--token-file') args.tokenFile = argv[++index];
    else if (arg === '--out') args.outputPath = argv[++index];
    else if (arg === '--env') args.envPath = argv[++index];
    else throw new Error(`unknown_argument:${arg}`);
  }
  return args;
}

function requestTimestamp(now) {
  return now().replace(/[-:.TZ]/g, '').slice(0, 14);
}

function resolvePath(root, value) {
  return isAbsolute(value) ? value : resolve(root, value);
}

function stripEnvValueQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  return value;
}

function trimTrailingSlash(value) {
  return String(value ?? '').replace(/\/+$/, '');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runCloudflareSiteRegistryProjectionCli();
}
