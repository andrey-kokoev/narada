import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MANAGEMENT_DEPLOYMENT_BUNDLE_SCHEMA } from '@narada2/invokable-intelligence-management';

import { authHeaders, resolveAuth } from './cloudflare-carrier-product-read.mjs';

export const CLOUDFLARE_INTELLIGENCE_DEPLOYMENT_MANIFEST_SCHEMA =
  'narada.cloudflare.invokable-intelligence.deployment-manifest.v1';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_MANIFEST = resolve(SCRIPT_DIRECTORY, '../config/invokable-intelligence.deployment.json');

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function manifestFile(directory, reference, label) {
  if (
    !reference
    || typeof reference.path !== 'string'
    || !reference.path
    || isAbsolute(reference.path)
    || reference.path.split(/[\\/]/u).includes('..')
    || !/^[a-f0-9]{64}$/u.test(String(reference.sha256 ?? ''))
  ) {
    throw new Error(`cloudflare_intelligence_deployment_invalid_${label}_reference`);
  }
  const path = resolve(directory, reference.path);
  if (path !== directory && !path.startsWith(`${directory}${sep}`)) {
    throw new Error(`cloudflare_intelligence_deployment_${label}_outside_manifest_directory`);
  }
  const bytes = readFileSync(path);
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== reference.sha256) {
    throw new Error(`cloudflare_intelligence_deployment_${label}_digest_mismatch`);
  }
  return JSON.parse(bytes.toString('utf8'));
}

export function loadIntelligenceDeploymentBundle(manifestPath = DEFAULT_MANIFEST) {
  const resolvedManifest = resolve(manifestPath);
  const manifest = JSON.parse(readFileSync(resolvedManifest, 'utf8'));
  if (
    manifest?.schema !== CLOUDFLARE_INTELLIGENCE_DEPLOYMENT_MANIFEST_SCHEMA
    || typeof manifest.id !== 'string' || !manifest.id
    || manifest.owning_site?.kind !== 'site' || typeof manifest.owning_site.id !== 'string'
    || typeof manifest.actor_id !== 'string' || !manifest.actor_id
    || typeof manifest.principal_id !== 'string' || !manifest.principal_id
    || typeof manifest.consent_ref !== 'string' || !manifest.consent_ref
    || manifest.destination_authority?.site_id !== manifest.owning_site.id
    || typeof manifest.destination_authority.locus !== 'string'
    || typeof manifest.destination_authority.authority_ref !== 'string'
    || typeof manifest.decided_at !== 'string' || !Number.isFinite(Date.parse(manifest.decided_at))
    || !Array.isArray(manifest.evidence_refs)
  ) {
    throw new Error('cloudflare_intelligence_deployment_invalid_manifest');
  }
  const directory = dirname(resolvedManifest);
  const catalog = manifestFile(directory, manifest.catalog, 'catalog');
  const materializations = manifestFile(directory, manifest.materializations, 'materializations');
  if (!Array.isArray(materializations.materializations)) {
    throw new Error('cloudflare_intelligence_deployment_invalid_materializations');
  }
  return {
    schema: MANAGEMENT_DEPLOYMENT_BUNDLE_SCHEMA,
    id: manifest.id,
    owning_site: manifest.owning_site,
    actor_id: manifest.actor_id,
    principal_id: manifest.principal_id,
    consent_ref: manifest.consent_ref,
    destination_authority: manifest.destination_authority,
    decided_at: manifest.decided_at,
    evidence_refs: manifest.evidence_refs,
    catalog,
    materializations: materializations.materializations,
  };
}

export async function deployIntelligence(args = process.argv.slice(2), env = process.env, fetchImpl = fetch) {
  const manifestPath = option(args, '--manifest') ?? DEFAULT_MANIFEST;
  const bundle = loadIntelligenceDeploymentBundle(manifestPath);
  if (args.includes('--dry-run')) {
    return {
      ok: true,
      dry_run: true,
      bundle_id: bundle.id,
      owning_site: bundle.owning_site,
      catalog_record_count: bundle.catalog.records.length,
      materialization_count: bundle.materializations.length,
    };
  }
  const workerUrl = option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? null;
  if (!workerUrl) throw new Error('cloudflare_intelligence_deployment_url_required');
  const auth = resolveAuth(args, env);
  if (!auth) throw new Error('cloudflare_intelligence_deployment_auth_required');
  const endpoint = new URL('/api/intelligence', workerUrl);
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...authHeaders(auth) },
    body: JSON.stringify(bundle),
  });
  const result = await response.json();
  if (!response.ok || result?.ok !== true) {
    const error = new Error(`cloudflare_intelligence_deployment_refused:${response.status}:${result?.result?.error?.code ?? result?.code ?? 'unknown'}`);
    error.result = result;
    throw error;
  }
  return result;
}

async function main() {
  try {
    const result = await deployIntelligence();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    if (error?.result) process.stderr.write(`${JSON.stringify(error.result, null, 2)}\n`);
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
