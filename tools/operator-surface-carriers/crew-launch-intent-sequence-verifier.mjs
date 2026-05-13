#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RESULT_SCHEMA = 'narada.crew_startup_shortcut.launch_intent_sequence_verification.v0';

function verifyLaunchIntentSequence(options = {}) {
  const siteRoot = path.resolve(required(options, 'site_root'));
  const sequencePath = path.resolve(siteRoot, options.sequence ?? '.narada/crew/architect.launch-intent-sequence.json');
  const capabilitiesPath = path.resolve(siteRoot, options.capabilities ?? '.narada/capabilities/mcp-surfaces.json');
  const sequence = readJson(sequencePath);
  const capabilities = readJson(capabilitiesPath);
  const liveTools = new Set((capabilities.mcp_surfaces ?? []).flatMap((surface) => surface.registered_live_tools ?? []));
  const requiredTools = (sequence.sequenceSteps ?? [])
    .map((step) => step.requiredTool)
    .filter((tool) => typeof tool === 'string');
  const missingTools = requiredTools.filter((tool) => !liveTools.has(tool));
  const refusals = [
    ...missingTools.map((tool) => `required_mcp_tool_not_live:${tool}`),
    ...executionRefusals(sequence),
  ];
  return {
    schema: RESULT_SCHEMA,
    status: refusals.length === 0 ? 'verified' : 'refused',
    site_root: siteRoot,
    sequence_path: sequencePath,
    capabilities_path: capabilitiesPath,
    request_id: sequence.requestId,
    required_tools: requiredTools,
    live_tools_checked: [...liveTools].sort(),
    refusals,
    launch_focus_bind_execution: 'blocked_without_separate_admitted_carrier',
    package_executed_launch: false,
    package_mutated_pc_state: false,
    operator_surface_runtime_mutated: false,
    native_shell_fallback_allowed: false,
  };
}

function executionRefusals(sequence) {
  const refusals = [];
  if (sequence.packageExecutedLaunch !== false) refusals.push('package_executed_launch_must_be_false');
  if (sequence.packageMutatedPcState !== false) refusals.push('package_mutated_pc_state_must_be_false');
  if (sequence.operatorSurfaceRuntimeMutated !== false) refusals.push('operator_surface_runtime_mutation_must_be_false');
  if (sequence.nativeShellFallbackAllowed !== false) refusals.push('native_shell_fallback_must_be_false');
  if (sequence.launchHandoff?.executionAdmitted !== false) refusals.push('launch_handoff_execution_not_admitted');
  const notAdmitted = new Set(sequence.notAdmitted ?? []);
  for (const required of [
    'Windows .lnk creation',
    'process launch',
    'direct substrate shortcut execution',
    'native shell fallback',
    'PC-locus mutation',
    'operator-surface runtime mutation',
    'operator-surface runtime copying',
  ]) {
    if (!notAdmitted.has(required)) refusals.push(`missing_not_admitted:${required}`);
  }
  return refusals;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function required(options, key) {
  if (typeof options[key] !== 'string' || options[key].length === 0) throw new Error(`${key}_required`);
  return options[key];
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--site-root') options.site_root = argv[++i];
    else if (arg === '--sequence') options.sequence = argv[++i];
    else if (arg === '--capabilities') options.capabilities = argv[++i];
    else throw new Error(`unsupported_argument:${arg}`);
  }
  return options;
}

function runCli(argv = process.argv.slice(2), stdout = process.stdout, stderr = process.stderr) {
  try {
    const result = verifyLaunchIntentSequence(parseArgs(argv));
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.status === 'verified' ? 0 : 2;
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
  verifyLaunchIntentSequence,
  parseArgs,
  runCli,
};
