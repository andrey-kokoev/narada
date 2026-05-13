#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyLaunchIntentSequence } from './crew-launch-intent-sequence-verifier.mjs';

const RESULT_SCHEMA = 'narada.crew_startup_shortcut.launch_focus_bind_request_planner.result.v0';
const REQUEST_SCHEMA = 'narada.crew_startup_shortcut.launch_focus_bind_request.v0';
const DEFAULT_SEQUENCE = '.narada/crew/architect.launch-intent-sequence.json';
const DEFAULT_OUTPUT_DIR = '.narada/crew/launch-requests';
const DEFAULT_CARRIER_ID = 'narada-proper.carrier.crew-launch-focus-bind.v0';

function planLaunchFocusBindRequest(options = {}) {
  const mode = options.mode ?? 'plan';
  const siteRoot = path.resolve(required(options, 'site_root'));
  const sequencePath = path.resolve(siteRoot, options.sequence ?? DEFAULT_SEQUENCE);
  const outputDir = path.resolve(siteRoot, options.output_dir ?? DEFAULT_OUTPUT_DIR);
  const verification = verifyLaunchIntentSequence({
    site_root: siteRoot,
    sequence: path.relative(siteRoot, sequencePath),
    capabilities: options.capabilities,
  });
  const refusals = [
    ...validateOptions(options),
    ...validateOutput(siteRoot, outputDir),
    ...(verification.status === 'verified' ? [] : verification.refusals.map((item) => `sequence_verification_failed:${item}`)),
  ];
  const sequence = readJson(sequencePath);
  const request = buildRequest({ siteRoot, sequencePath, sequence, outputDir, options, verification });
  const base = {
    schema: RESULT_SCHEMA,
    mode,
    status: 'planned',
    site_root: siteRoot,
    sequence_path: sequencePath,
    output_dir: outputDir,
    request_path: request.path,
    request: request.content,
    sequence_verification: verification,
    refusals,
    not_admitted: request.content.not_admitted,
    package_executed_launch: false,
    package_mutated_pc_state: false,
    operator_surface_runtime_mutated: false,
    native_shell_fallback_allowed: false,
  };

  if (refusals.length > 0) return { ...base, status: 'refused' };
  if (mode === 'plan') return base;
  if (mode === 'apply') {
    if (options.mutation_authorized !== true) {
      return { ...base, status: 'refused', refusals: ['launch_request_write_authority_missing'] };
    }
    fs.mkdirSync(outputDir, { recursive: true });
    const previous = fs.existsSync(request.path) ? fs.readFileSync(request.path, 'utf8') : null;
    const next = `${JSON.stringify(request.content, null, 2)}\n`;
    if (previous !== next) fs.writeFileSync(request.path, next, 'utf8');
    return { ...base, status: 'applied', created_or_changed: previous === next ? [] : [request.path] };
  }
  if (mode === 'verify') {
    return { ...base, status: fs.existsSync(request.path) ? 'verified' : 'refused', refusals: fs.existsSync(request.path) ? [] : ['launch_request_missing'] };
  }
  return { ...base, status: 'refused', refusals: [`unsupported_mode:${mode}`] };
}

function buildRequest({ siteRoot, sequencePath, sequence, outputDir, options, verification }) {
  const requestId = options.request_id ?? `${sequence.requestId}.launch-focus-bind-request.v0`;
  const fileName = `${sanitize(requestId)}.json`;
  return {
    path: path.join(outputDir, fileName),
    content: {
      schema: REQUEST_SCHEMA,
      request_id: requestId,
      status: 'awaiting_admitted_carrier',
      carrier_id: options.carrier_id ?? DEFAULT_CARRIER_ID,
      site_id: sequence.siteId,
      site_root: siteRoot,
      sequence_path: sequencePath,
      sequence_request_id: sequence.requestId,
      launch_handoff: sequence.launchHandoff,
      verified_required_tools: verification.required_tools,
      evidence_required_before_execution: [
        'preflight verifier output',
        'operator-surface target resolution',
        'concrete carrier admission decision',
        'transport/supervisor id',
        'rollback or recovery note',
      ],
      not_admitted: [
        'Windows .lnk creation',
        'process launch',
        'direct substrate shortcut execution',
        'native shell fallback',
        'PC-locus mutation',
        'operator-surface runtime mutation',
        'operator-surface runtime copying',
        'raw WSL crossing as mutation authority',
        'source Site runtime state import',
        'secret or credential access',
        'implicit capability grants',
      ],
      package_executed_launch: false,
      package_mutated_pc_state: false,
      operator_surface_runtime_mutated: false,
      native_shell_fallback_allowed: false,
    },
  };
}

function validateOptions(options) {
  const refusals = [];
  if (options.direct_launch_execution === true) refusals.push('direct_launch_execution_refused');
  if (options.native_shell_fallback === true) refusals.push('native_shell_fallback_refused');
  if (options.pc_locus_mutation === true) refusals.push('pc_locus_mutation_refused');
  if (options.copy_operator_surface_runtime === true) refusals.push('operator_surface_runtime_copying_refused');
  return refusals;
}

function validateOutput(siteRoot, outputDir) {
  if (!isInside(siteRoot, outputDir)) return ['launch_request_output_outside_site_root_refused'];
  return [];
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
    else if (arg === '--sequence') options.sequence = argv[++i];
    else if (arg === '--capabilities') options.capabilities = argv[++i];
    else if (arg === '--output-dir') options.output_dir = argv[++i];
    else if (arg === '--request-id') options.request_id = argv[++i];
    else if (arg === '--carrier-id') options.carrier_id = argv[++i];
    else if (arg === '--mutation-authorized') options.mutation_authorized = true;
    else if (arg === '--direct-launch-execution') options.direct_launch_execution = true;
    else if (arg === '--native-shell-fallback') options.native_shell_fallback = true;
    else if (arg === '--pc-locus-mutation') options.pc_locus_mutation = true;
    else if (arg === '--copy-operator-surface-runtime') options.copy_operator_surface_runtime = true;
    else throw new Error(`unsupported_argument:${arg}`);
  }
  return options;
}

function runCli(argv = process.argv.slice(2), stdout = process.stdout, stderr = process.stderr) {
  try {
    const result = planLaunchFocusBindRequest(parseArgs(argv));
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
  REQUEST_SCHEMA,
  RESULT_SCHEMA,
  planLaunchFocusBindRequest,
  parseArgs,
  runCli,
};
