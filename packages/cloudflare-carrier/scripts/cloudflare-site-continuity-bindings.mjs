#!/usr/bin/env node

import { readdirSync, statSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createSiteContinuityBindingRegistry,
  listSiteContinuityBindingSites,
  validateSiteContinuityBinding,
  validateSiteContinuityBindingRegistry,
} from '@narada2/site-continuity';

const DEFAULT_PACKET_PATHS = ['.narada/site-continuity/local-windows-packet.json'];
const DEFAULT_BINDING_REGISTRY_PATH = '.narada/site-continuity/bindings.json';

async function main() {
  const plan = buildBindingMaterializationPlan({
    argv: process.argv.slice(2),
    env: process.env,
    cwd: process.env.INIT_CWD ?? process.cwd(),
  });
  const result = await runSiteContinuityBindingWorkflow(plan);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
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
    default:
      throw new Error(`unknown_site_continuity_binding_action:${plan.action}`);
  }
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
  DEFAULT_PACKET_PATHS,
  buildBindingMaterializationPlan,
  listMaterializedSiteContinuityBindingRegistry,
  materializeSiteContinuityBindingRegistry,
  runSiteContinuityBindingWorkflow,
  validateMaterializedSiteContinuityBindingRegistry,
};
