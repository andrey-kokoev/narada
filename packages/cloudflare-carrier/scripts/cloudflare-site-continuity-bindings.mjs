#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SITE_CONTINUITY_EMBODIMENT_KINDS,
  classifySiteContinuityExchangePacket,
  createSiteContinuityBinding,
  createSiteContinuityExchangePacket,
  createSiteContinuityBindingRegistry,
  listSiteContinuityBindingSites,
  validateSiteContinuityBinding,
  validateSiteContinuityExchangePacket,
  validateSiteContinuityBindingRegistry,
} from '@narada2/site-continuity';

const DEFAULT_PACKET_PATHS = ['.narada/site-continuity/local-windows-packet.json'];
const DEFAULT_BINDING_REGISTRY_PATH = '.narada/site-continuity/bindings.json';
const DEFAULT_HEALTH_SNAPSHOT_PATH = '.narada/site-continuity/health/cloudflare-continuity-health-last.json';
const DEFAULT_PREPARED_PACKET_DIRECTORY = '.narada/site-continuity/prepared-bindings';

async function main() {
  const plan = buildBindingMaterializationPlan({
    argv: process.argv.slice(2),
    env: process.env,
    cwd: process.env.INIT_CWD ?? process.cwd(),
  });
  const result = await runSiteContinuityBindingWorkflow(plan);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function readScheduledHealthSnapshotForBindingPreparation(healthSnapshotPath) {
  if (!existsSync(healthSnapshotPath)) throw new Error(`scheduled_health_snapshot_missing:${healthSnapshotPath}`);
  const snapshot = JSON.parse(await readFile(healthSnapshotPath, 'utf8'));
  if (snapshot?.schema !== 'narada.cloudflare_carrier.site_continuity_scheduled_health_snapshot.v1') {
    throw new Error(`scheduled_health_snapshot_schema_mismatch:${snapshot?.schema ?? 'missing'}`);
  }
  const bindingAlignment = snapshot.cloudflare_product_binding_alignment ?? null;
  const operatorNextAction = bindingAlignment?.state === 'unbound_remote_next_site'
    ? 'bind_cloudflare_product_next_site_locally'
    : null;
  return {
    operator_next_action: operatorNextAction,
    operator_next_target_site_id: bindingAlignment?.cloudflare_product_next_site_id ?? null,
    operator_next_reason: bindingAlignment?.reason ?? null,
    cloudflare_product_next_site_id: snapshot.cloudflare_product_posture?.summary?.next_site_id ?? null,
  };
}

function readCloudflareSiteProjectionRecord(plan, siteId) {
  const projectionPath = path.resolve(plan.cwd, '.narada/site-registry/cloudflare-sites.json');
  if (!existsSync(projectionPath)) return null;
  try {
    const projection = JSON.parse(readFileSync(projectionPath, 'utf8'));
    return (projection?.sites ?? []).find((site) => site?.site_id === siteId) ?? null;
  } catch {
    return null;
  }
}

function fileSafeId(value) {
  return String(value ?? 'unknown-site').replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown-site';
}

function buildBindingMaterializationPlan({ argv = [], env = process.env, cwd = process.cwd() } = {}) {
  const args = parseArgs(argv);
  const packetDirectories = collectPacketDirectories(args, env);
  const packetPaths = collectPacketPaths(args, env, cwd, packetDirectories);
  const outputPath = args.output
    ?? env.NARADA_SITE_CONTINUITY_BINDINGS
    ?? DEFAULT_BINDING_REGISTRY_PATH;

  return {
    cwd,
    action: args.action ?? env.NARADA_SITE_CONTINUITY_BINDING_ACTION ?? 'materialize',
    packet_paths: packetPaths,
    packet_directories: packetDirectories,
    output_path: outputPath,
    effective_packet_paths: packetPaths.map((packetPath) => resolvePath(cwd, packetPath)),
    effective_packet_directories: packetDirectories.map((packetDirectory) => resolvePath(cwd, packetDirectory)),
    effective_output_path: resolvePath(cwd, outputPath),
    registry_path: args.registry ?? outputPath,
    effective_registry_path: resolvePath(cwd, args.registry ?? outputPath),
    health_snapshot_path: args.health ?? env.NARADA_SITE_CONTINUITY_HEALTH_SNAPSHOT ?? DEFAULT_HEALTH_SNAPSHOT_PATH,
    effective_health_snapshot_path: resolvePath(cwd, args.health ?? env.NARADA_SITE_CONTINUITY_HEALTH_SNAPSHOT ?? DEFAULT_HEALTH_SNAPSHOT_PATH),
    packet_output_path: args.packet_output ?? env.NARADA_SITE_CONTINUITY_PREPARED_PACKET ?? null,
    effective_packet_output_path: args.packet_output || env.NARADA_SITE_CONTINUITY_PREPARED_PACKET
      ? resolvePath(cwd, args.packet_output ?? env.NARADA_SITE_CONTINUITY_PREPARED_PACKET)
      : null,
    prepared_packet_directory: args.packet_output_dir ?? env.NARADA_SITE_CONTINUITY_PREPARED_PACKET_DIR ?? DEFAULT_PREPARED_PACKET_DIRECTORY,
    effective_prepared_packet_directory: resolvePath(cwd, args.packet_output_dir ?? env.NARADA_SITE_CONTINUITY_PREPARED_PACKET_DIR ?? DEFAULT_PREPARED_PACKET_DIRECTORY),
    target_site_id: args.site ?? env.NARADA_SITE_CONTINUITY_TARGET_SITE ?? null,
    local_site_ref: args.local_site_ref ?? env.NARADA_SITE_CONTINUITY_LOCAL_SITE_REF ?? null,
    cloudflare_site_ref: args.cloudflare_site_ref ?? env.NARADA_SITE_CONTINUITY_CLOUDFLARE_SITE_REF ?? null,
    authority_map_ref: args.authority_map_ref ?? env.NARADA_SITE_CONTINUITY_AUTHORITY_MAP_REF ?? null,
    registry_ref: args.registry_ref ?? env.NARADA_SITE_CONTINUITY_BINDING_REGISTRY_REF ?? 'local-cloud-site-continuity-bindings',
    generated_at: args.generated_at ?? env.NARADA_SITE_CONTINUITY_BINDING_GENERATED_AT ?? new Date().toISOString(),
    dry_run: args.dry_run === true,
  };
}

async function runSiteContinuityBindingWorkflow(plan) {
  switch (plan.action) {
    case 'materialize':
      return materializeSiteContinuityBindingRegistry(plan);
    case 'validate':
      return validateMaterializedSiteContinuityBindingRegistry(plan);
    case 'list':
      return listMaterializedSiteContinuityBindingRegistry(plan);
    case 'prepare-next-binding-packet':
      return prepareNextSiteContinuityBindingPacket(plan);
    default:
      throw new Error(`unknown_site_continuity_binding_action:${plan.action}`);
  }
}

async function prepareNextSiteContinuityBindingPacket(plan) {
  const health = await readScheduledHealthSnapshotForBindingPreparation(plan.effective_health_snapshot_path);
  const targetSiteId = plan.target_site_id ?? health.operator_next_target_site_id ?? health.cloudflare_product_next_site_id ?? null;
  const operatorAction = health.operator_next_action ?? null;
  if (operatorAction && operatorAction !== 'bind_cloudflare_product_next_site_locally') {
    return {
      ok: false,
      action: 'refused',
      reason: 'scheduled_health_next_action_not_site_binding',
      operator_next_action: operatorAction,
      target_site_id: targetSiteId,
      health_snapshot_path: plan.effective_health_snapshot_path,
      embeds_credentials: false,
    };
  }
  if (!targetSiteId) {
    return {
      ok: false,
      action: 'refused',
      reason: 'scheduled_health_next_site_missing',
      health_snapshot_path: plan.effective_health_snapshot_path,
      embeds_credentials: false,
    };
  }
  const siteRecord = readCloudflareSiteProjectionRecord(plan, targetSiteId);
  const localSiteRef = plan.local_site_ref;
  const cloudflareSiteRef = plan.cloudflare_site_ref ?? siteRecord?.site_ref ?? null;
  const missingInputs = [
    localSiteRef ? null : 'local_site_ref',
    cloudflareSiteRef ? null : 'cloudflare_site_ref',
  ].filter(Boolean);
  if (missingInputs.length > 0) {
    return {
      ok: false,
      action: 'refused',
      reason: 'site_continuity_binding_refs_missing',
      target_site_id: targetSiteId,
      required_inputs: missingInputs,
      operator_next_action: operatorAction,
      operator_next_reason: health.operator_next_reason ?? null,
      cloudflare_site_projection_state: siteRecord ? 'found' : 'missing',
      cloudflare_site_ref_from_projection: siteRecord?.site_ref ?? null,
      command_hint: 'pnpm --filter @narada2/cloudflare-carrier continuity:bindings:prepare-next -- --local-site-ref <file-or-site-ref> --cloudflare-site-ref <cloudflare-site-ref>',
      embeds_credentials: false,
    };
  }
  const binding = createSiteContinuityBinding({
    site_id: targetSiteId,
    local_windows_site_ref: localSiteRef,
    cloudflare_site_ref: cloudflareSiteRef,
    authority_map_ref: plan.authority_map_ref ?? `narada:site-authority-map:${targetSiteId}`,
    generated_at: plan.generated_at,
  });
  const packet = createSiteContinuityExchangePacket({
    binding,
    source_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER,
    target_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS,
    generated_at: plan.generated_at,
  });
  const packetValidation = validateSiteContinuityExchangePacket(packet);
  if (!packetValidation.ok) {
    throw new Error(`site_continuity_prepared_packet_invalid:${packetValidation.errors.join(',')}`);
  }
  const admission = classifySiteContinuityExchangePacket(packet);
  const outputPath = plan.effective_packet_output_path
    ?? path.join(plan.effective_prepared_packet_directory, `${fileSafeId(targetSiteId)}-packet.json`);
  if (!plan.dry_run) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(packet, null, 2)}\n`, 'utf8');
  }
  return {
    ok: true,
    action: plan.dry_run ? 'prepared' : 'written',
    reason: 'site_continuity_binding_packet_prepared',
    target_site_id: targetSiteId,
    output_path: outputPath,
    packet_id: packet.packet_id,
    relation_id: packet.relation_id,
    admission_action: admission.action,
    admission_reason: admission.reason,
    materialize_hint: `pnpm --filter @narada2/cloudflare-carrier continuity:bindings -- --packet ${outputPath}`,
    embeds_credentials: false,
  };
}

async function materializeSiteContinuityBindingRegistry(plan) {
  const packetReads = [];
  const bindings = [];
  const seenRelationIds = new Set();

  for (const packetPath of plan.effective_packet_paths) {
    const packet = JSON.parse(await readFile(packetPath, 'utf8'));
    const binding = packet?.binding;
    const validation = validateSiteContinuityBinding(binding);
    packetReads.push({ path: packetPath, site_id: binding?.site_id ?? null, relation_id: binding?.relation_id ?? null, validation });
    if (!validation.ok) {
      throw new Error(`site_continuity_packet_binding_invalid:${packetPath}:${validation.errors.join(',')}`);
    }
    if (seenRelationIds.has(binding.relation_id)) {
      throw new Error(`site_continuity_binding_relation_duplicate:${binding.relation_id}`);
    }
    seenRelationIds.add(binding.relation_id);
    bindings.push(binding);
  }

  const registry = createSiteContinuityBindingRegistry({
    bindings,
    registry_ref: plan.registry_ref,
    generated_at: plan.generated_at,
  });
  const registryValidation = validateSiteContinuityBindingRegistry(registry);
  if (!registryValidation.ok) {
    throw new Error(`site_continuity_binding_registry_invalid:${registryValidation.errors.join(',')}`);
  }

  if (!plan.dry_run) {
    await mkdir(path.dirname(plan.effective_output_path), { recursive: true });
    await writeFile(plan.effective_output_path, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
  }

  return {
    ok: true,
    action: plan.dry_run ? 'validated' : 'materialized',
    output_path: plan.effective_output_path,
    registry_ref: registry.registry_ref,
    binding_count: registry.bindings.length,
    sites: registry.bindings.map((binding) => binding.site_id).sort((left, right) => left.localeCompare(right)),
    packet_reads: packetReads.map((read) => ({
      path: read.path,
      site_id: read.site_id,
      relation_id: read.relation_id,
      validation: read.validation.ok ? 'ok' : read.validation.errors,
    })),
  };
}

async function validateMaterializedSiteContinuityBindingRegistry(plan) {
  const registry = await readMaterializedSiteContinuityBindingRegistry(plan);
  return {
    ok: true,
    action: 'validated',
    registry_path: plan.effective_registry_path,
    registry_ref: registry.registry_ref,
    binding_count: registry.bindings.length,
    sites: listSiteContinuityBindingSites(registry),
  };
}

async function listMaterializedSiteContinuityBindingRegistry(plan) {
  const registry = await readMaterializedSiteContinuityBindingRegistry(plan);
  return {
    ok: true,
    action: 'listed',
    registry_path: plan.effective_registry_path,
    registry_ref: registry.registry_ref,
    binding_count: registry.bindings.length,
    sites: registry.bindings
      .map((binding) => ({
        site_id: binding.site_id,
        relation_id: binding.relation_id,
        embodiments: (binding.embodiments ?? [])
          .map((embodiment) => ({
            embodiment_kind: embodiment.embodiment_kind,
            site_ref: embodiment.site_ref,
            authority_locus: embodiment.authority_locus,
          }))
          .sort((left, right) => left.embodiment_kind.localeCompare(right.embodiment_kind)),
      }))
      .sort((left, right) => left.site_id.localeCompare(right.site_id)),
  };
}

async function readMaterializedSiteContinuityBindingRegistry(plan) {
  const registry = JSON.parse(await readFile(plan.effective_registry_path, 'utf8'));
  const validation = validateSiteContinuityBindingRegistry(registry);
  if (!validation.ok) {
    throw new Error(`site_continuity_binding_registry_invalid:${validation.errors.join(',')}`);
  }
  return registry;
}

function collectPacketPaths(args, env, cwd, packetDirectories = []) {
  const configuredPackets = [];
  if (args.packet) configuredPackets.push(...asArray(args.packet));
  if (env.NARADA_SITE_CONTINUITY_PACKET) configuredPackets.push(...splitList(env.NARADA_SITE_CONTINUITY_PACKET));
  if (env.NARADA_SITE_CONTINUITY_PACKETS) configuredPackets.push(...splitList(env.NARADA_SITE_CONTINUITY_PACKETS));
  const directoryPackets = packetDirectories.flatMap((packetDirectory) => readPacketDirectoryPaths(cwd, packetDirectory));
  const configured = [...configuredPackets, ...directoryPackets];
  const selected = configured.length > 0 ? configured : DEFAULT_PACKET_PATHS;
  return [...new Set(selected.map((item) => String(item).trim()).filter(Boolean))];
}

function collectPacketDirectories(args, env) {
  const configuredDirectories = [];
  if (args.packet_dir) configuredDirectories.push(...asArray(args.packet_dir));
  if (env.NARADA_SITE_CONTINUITY_PACKET_DIR) configuredDirectories.push(...splitList(env.NARADA_SITE_CONTINUITY_PACKET_DIR));
  return [...new Set(configuredDirectories.map((item) => String(item).trim()).filter(Boolean))];
}

function readPacketDirectoryPaths(cwd, packetDirectory) {
  const effectiveDirectory = resolvePath(cwd, packetDirectory);
  let entries;
  try {
    entries = readdirSync(effectiveDirectory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`site_continuity_packet_directory_missing:${effectiveDirectory}`);
    throw error;
  }
  const packetPaths = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('-packet.json'))
    .map((entry) => path.join(effectiveDirectory, entry.name))
    .filter((packetPath) => statSync(packetPath).isFile())
    .sort((left, right) => left.localeCompare(right));
  if (packetPaths.length === 0) throw new Error(`site_continuity_packet_directory_empty:${effectiveDirectory}`);
  return packetPaths;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      args.dry_run = true;
      continue;
    }
    if (arg === '--health') {
      args.health = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--site') {
      args.site = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--local-site-ref') {
      args.local_site_ref = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--cloudflare-site-ref') {
      args.cloudflare_site_ref = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--authority-map-ref') {
      args.authority_map_ref = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--packet-output') {
      args.packet_output = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--packet-output-dir') {
      args.packet_output_dir = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--action') {
      args.action = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--packet') {
      args.packet = [...asArray(args.packet), argv[index + 1]];
      index += 1;
      continue;
    }
    if (arg === '--packet-dir') {
      args.packet_dir = [...asArray(args.packet_dir), argv[index + 1]];
      index += 1;
      continue;
    }
    if (arg === '--registry') {
      args.registry = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--output') {
      args.output = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--registry-ref') {
      args.registry_ref = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--generated-at') {
      args.generated_at = argv[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`unknown_argument:${arg}`);
  }
  return args;
}

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function splitList(value) {
  return String(value ?? '').split(/[;,]/u).map((item) => item.trim()).filter(Boolean);
}

function resolvePath(cwd, value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error('path_missing');
  return path.resolve(cwd, normalized);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const modulePath = fileURLToPath(import.meta.url);
if (invokedPath === modulePath) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}

export {
  DEFAULT_BINDING_REGISTRY_PATH,
  DEFAULT_HEALTH_SNAPSHOT_PATH,
  DEFAULT_PACKET_PATHS,
  DEFAULT_PREPARED_PACKET_DIRECTORY,
  buildBindingMaterializationPlan,
  listMaterializedSiteContinuityBindingRegistry,
  materializeSiteContinuityBindingRegistry,
  prepareNextSiteContinuityBindingPacket,
  runSiteContinuityBindingWorkflow,
  validateMaterializedSiteContinuityBindingRegistry,
};
