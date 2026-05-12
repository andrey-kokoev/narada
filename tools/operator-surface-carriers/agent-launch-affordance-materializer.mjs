#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RESULT_SCHEMA = 'narada.operator_surface.agent_launch_affordance_materializer.result.v0';
const DEFAULT_AFFORDANCES = 'operator-surfaces/agent-launch-affordances.json';
const DEFAULT_IDENTITIES = 'operator-surfaces/identities.json';
const DEFAULT_OUTPUT_DIR = '.crew/agent-shortcuts';
const LAUNCH_DESCRIPTOR_PATH = 'tools/operator-surface-carriers/windows-glue/Start-CodexResumeOperatorSurfaces.descriptor.json';

function runMaterializer(options = {}) {
  const mode = options.mode ?? 'plan';
  const siteRoot = path.resolve(required(options, 'site_root'));
  const context = {
    siteRoot,
    mode,
    siteId: options.site_id ?? 'narada',
    affordancePath: path.resolve(siteRoot, options.affordances ?? DEFAULT_AFFORDANCES),
    identitiesPath: path.resolve(siteRoot, options.identities ?? DEFAULT_IDENTITIES),
    outputDir: path.resolve(siteRoot, options.output_dir ?? DEFAULT_OUTPUT_DIR),
    runtime: options.runtime ?? 'codex',
  };
  const affordances = readJson(context.affordancePath);
  const identities = readJson(context.identitiesPath);
  const records = selectAffordances(affordances, options.identity_names, context.runtime);
  const refusals = [
    ...sharedRefusals(context, options),
    ...validateAffordances(context, records, identities),
  ];
  const planned = records.map((record) => projectionRecord(context, record));
  const base = {
    schema: RESULT_SCHEMA,
    mode,
    status: 'planned',
    site_root: siteRoot,
    site_id: context.siteId,
    output_dir: context.outputDir,
    selected_identities: records.map((record) => record.identity_name),
    planned_projection_files: planned.map((record) => record.path),
    refusals,
    not_admitted: [
      'process_launch',
      'direct_substrate_shortcut_execution',
      'native_shell_fallback',
      'pc_locus_mutation',
      'operator_surface_runtime_copying',
      'source_site_runtime_state_import',
      'secret_or_credential_capture',
      'runtime_binding_mutation',
    ],
    proof_before_bind_required: true,
    package_executed_launch: false,
    package_mutated_pc_state: false,
    package_copied_operator_surface_runtime: false,
  };

  if (refusals.length > 0) return { ...base, status: 'refused' };
  if (mode === 'plan') return base;
  if (mode === 'verify') return verify(context, planned, base);
  if (mode === 'recover') return recover(context, planned, base);
  if (mode === 'apply') {
    if (options.mutation_authorized !== true) return { ...base, status: 'refused', refusals: ['projection_write_authority_missing'] };
    fs.mkdirSync(context.outputDir, { recursive: true });
    const changed = [];
    for (const record of planned) {
      const previous = fs.existsSync(record.path) ? fs.readFileSync(record.path, 'utf8') : null;
      const next = `${JSON.stringify(record.content, null, 2)}\n`;
      if (previous !== next) {
        fs.writeFileSync(record.path, next, 'utf8');
        changed.push(record.path);
      }
    }
    return { ...verify(context, planned, base), status: 'applied', created_or_changed: changed };
  }
  return { ...base, status: 'refused', refusals: [`unsupported_mode:${mode}`] };
}

function selectAffordances(affordances, identityNames, runtime) {
  const requested = identityNames && identityNames.length > 0 ? new Set(identityNames) : null;
  return (affordances.affordances ?? [])
    .filter((record) => record.enabled === true)
    .filter((record) => record.runtime === runtime)
    .filter((record) => !requested || requested.has(record.identity_name));
}

function sharedRefusals(context, options) {
  const refusals = [];
  if (!fs.existsSync(path.join(context.siteRoot, '.narada'))) refusals.push('target_site_seed_missing');
  if (options.import_source_runtime_state === true) refusals.push('source_runtime_state_import_refused');
  if (options.native_shell_fallback === true) refusals.push('native_shell_fallback_refused');
  if (options.direct_shortcut_execution === true) refusals.push('direct_substrate_shortcut_execution_refused');
  if (options.copy_operator_surface_runtime === true) refusals.push('operator_surface_runtime_copying_refused');
  if (!isInside(context.siteRoot, context.outputDir)) refusals.push('projection_output_outside_site_root_refused');
  return refusals;
}

function validateAffordances(context, records, identities) {
  const admitted = new Set((identities.identities ?? []).map((identity) => `${identity.site_id}.${identity.identity_id}`));
  const refusals = [];
  if (records.length === 0) refusals.push('no_enabled_affordances_selected');
  for (const record of records) {
    if (!admitted.has(record.identity_name)) refusals.push(`identity_not_admitted:${record.identity_name}`);
    if (!record.materializations?.some((item) => item.kind === 'desktop_shortcut')) {
      refusals.push(`desktop_shortcut_materialization_missing:${record.identity_name}`);
    }
    const proof = record.required_binding_proof ?? {};
    for (const key of [
      'before_window_snapshot',
      'unique_new_carrier_window',
      'inhabited_child_claim',
      'exactly_one_new_visible_cascadia_hwnd',
      'sqlite_binding_to_admitted_identity',
      'osl_projection_refresh',
      'fail_closed_on_ambiguous_or_missing_window_delta',
    ]) {
      if (proof[key] !== true) refusals.push(`binding_proof_missing:${record.identity_name}:${key}`);
    }
  }
  return refusals;
}

function projectionRecord(context, record) {
  const basename = sanitize(`${record.label}.lnk.projection.json`);
  return {
    path: path.join(context.outputDir, basename),
    content: {
      schema: 'narada.operator_surface.agent_launch_shortcut_projection.v0',
      affordance_id: record.affordance_id,
      label: record.label,
      identity_name: record.identity_name,
      runtime: record.runtime,
      projection_only: true,
      launch_command_intent: {
        posture: 'descriptor_only',
        descriptor_path: LAUNCH_DESCRIPTOR_PATH,
        execution_admitted: false,
        args: [
          '-IdentityResumePair',
          `${record.identity_name}=${record.identity_name}`,
          '-Runtime',
          record.runtime,
          '-EnsurePresent',
          '-ShowSummary',
        ],
      },
      required_binding_proof: record.required_binding_proof,
      not_admitted: [
        'process_launch',
        'runtime_binding_mutation',
        'native_shell_fallback',
        'operator_surface_runtime_copying',
      ],
    },
  };
}

function verify(context, planned, base) {
  const missing = planned.filter((record) => !fs.existsSync(record.path)).map((record) => record.path);
  return {
    ...base,
    status: missing.length === 0 ? 'verified' : 'refused',
    refusals: missing.length === 0 ? [] : ['projection_files_missing'],
    verification: {
      missing_projection_files: missing,
      projection_count: planned.length,
    },
  };
}

function recover(context, planned, base) {
  const existing = planned.filter((record) => fs.existsSync(record.path)).map((record) => record.path);
  return {
    ...base,
    status: 'recovered',
    recovery_classification: existing.length === 0 ? 'absent' : existing.length === planned.length ? 'complete_projection' : 'partial_projection',
    existing_projection_files: existing,
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function required(options, key) {
  if (typeof options[key] !== 'string' || options[key].length === 0) throw new Error(`${key}_required`);
  return options[key];
}

function isInside(parent, child) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function sanitize(value) {
  return value.replace(/[<>:"/\\|?*]+/g, '-');
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--mode') options.mode = argv[++i];
    else if (arg === '--site-root') options.site_root = argv[++i];
    else if (arg === '--site-id') options.site_id = argv[++i];
    else if (arg === '--affordances') options.affordances = argv[++i];
    else if (arg === '--identities') options.identities = argv[++i];
    else if (arg === '--output-dir') options.output_dir = argv[++i];
    else if (arg === '--runtime') options.runtime = argv[++i];
    else if (arg === '--identity') {
      options.identity_names = options.identity_names ?? [];
      options.identity_names.push(argv[++i]);
    } else if (arg === '--mutation-authorized') options.mutation_authorized = true;
    else if (arg === '--import-source-runtime-state') options.import_source_runtime_state = true;
    else if (arg === '--native-shell-fallback') options.native_shell_fallback = true;
    else if (arg === '--direct-shortcut-execution') options.direct_shortcut_execution = true;
    else if (arg === '--copy-operator-surface-runtime') options.copy_operator_surface_runtime = true;
    else throw new Error(`unsupported_argument:${arg}`);
  }
  return options;
}

function runCli(argv = process.argv.slice(2), stdout = process.stdout, stderr = process.stderr) {
  try {
    const result = runMaterializer(parseArgs(argv));
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.status === 'refused' ? 2 : 0;
  } catch (error) {
    stderr.write(`${JSON.stringify({ schema: RESULT_SCHEMA, status: 'refused', refusals: [error instanceof Error ? error.message : String(error)] })}\n`);
    return 2;
  }
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (entryPath && entryPath === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli();
}

export {
  RESULT_SCHEMA,
  runMaterializer,
  parseArgs,
  runCli,
};
