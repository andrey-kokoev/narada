#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SITE_ROOT = resolve(__dirname, '..', '..');
const DEFAULT_NARADA_PROPER_ROOT = DEFAULT_SITE_ROOT;
const REPORT_SCHEMA = 'narada.agent_tui.live_turn_acceptance_report.v0';
const RESULT_SCHEMA = 'narada.agent_tui.live_turn_result.v0';
const REQUIRED_EVENT_KINDS = [
  'input_admitted_to_turn',
  'provider_request_recorded',
  'provider_tool_call_requested',
  'tool_call_requested',
  'tool_result_received',
  'turn_completed',
];
const REQUIRED_PROVIDER_ADMISSION_EVENT_KINDS = [
  'input_admitted_to_turn',
  'turn_started',
  'provider_request_recorded',
  'turn_completed',
];

function timestampId(now = new Date()) {
  return now.toISOString().replaceAll(/[-:.TZ]/g, '').slice(0, 14);
}

function defaultAcceptancePaths(siteRoot = DEFAULT_SITE_ROOT) {
  const root = resolve(siteRoot);
  const dir = join(root, '.narada', 'crew', 'agent-tui-live-turn-acceptance');
  return {
    siteRoot: root,
    dir,
    directivePath: join(dir, 'directive.txt'),
    resultPath: join(dir, 'result.json'),
    resultRelativePath: relative(root, join(dir, 'result.json')).replaceAll('\\', '/'),
    runLogPath: join(dir, 'run.log'),
    latestProofPath: join(dir, 'latest.json'),
  };
}

function buildAcceptanceDirective({ resultRelativePath, providerAdmissionOnly = false }) {
  if (providerAdmissionOnly) {
    return [
      'You are testing agent-tui governed live provider admission.',
      'Respond with exactly this text and do not call tools:',
      'provider admission ok',
    ].join('\n');
  }
  return [
    'You are testing agent-tui governed live provider plus MCP execution.',
    'Respond with only this JSON object and no prose, no markdown fence:',
    JSON.stringify({
      narada_tool_call: {
        name: 'site_loop_status',
        arguments: {},
      },
    }),
  ].join('\n');
}

function parseArgs(argv) {
  const args = {
    siteRoot: DEFAULT_SITE_ROOT,
    identity: 'narada.resident',
    maxSteps: '2400',
    timeoutMs: 300000,
    json: false,
    write: true,
    normalLaunchDefaults: false,
    providerAdmissionOnly: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--site-root') args.siteRoot = resolve(argv[++i]);
    else if (arg === '--identity') args.identity = argv[++i];
    else if (arg === '--max-steps') args.maxSteps = argv[++i];
    else if (arg === '--timeout-ms') args.timeoutMs = Number(argv[++i]);
    else if (arg === '--output') args.output = resolve(argv[++i]);
    else if (arg === '--json') args.json = true;
    else if (arg === '--no-write') args.write = false;
    else if (arg === '--normal-launch-defaults') args.normalLaunchDefaults = true;
    else if (arg === '--provider-admission-only') args.providerAdmissionOnly = true;
    else throw new Error(`unsupported_argument:${arg}`);
  }
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) {
    throw new Error('invalid_timeout_ms');
  }
  if (!Number.isFinite(Number(args.maxSteps)) || Number(args.maxSteps) <= 0) {
    throw new Error('invalid_max_steps');
  }
  return args;
}

function parseLaunchLog(logText, siteRoot = DEFAULT_SITE_ROOT) {
  const carrierMatch = logText.match(/(?:carrier_session|carrier_session_id):\s*(\S+)/)
    ?? logText.match(/NARADA_CARRIER_SESSION_ID=([^\r\n]+)/);
  const launchResultMatch = logText.match(/(?:launch_result|launch_result_path):\s*([^\r\n]+)/);
  const agentStartMatch = logText.match(/agent_start_event:\s*(\S+)/)
    ?? logText.match(/agent-start:\s*([^\r\n]+)/);
  const carrierSessionId = carrierMatch?.[1]?.trim() ?? null;
  return {
    carrier_session_id: carrierSessionId,
    agent_start_event: agentStartMatch?.[1]?.trim() ?? null,
    launch_result_path: launchResultMatch?.[1]?.trim() ?? null,
    session_jsonl_path: carrierSessionId
      ? join(resolve(siteRoot), '.narada', 'crew', 'nars-sessions', carrierSessionId, 'session.jsonl')
      : null,
    control_jsonl_path: carrierSessionId
      ? join(resolve(siteRoot), '.narada', 'crew', 'nars-sessions', carrierSessionId, 'control.jsonl')
      : null,
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readSessionEvents(sessionPath) {
  if (!sessionPath || !existsSync(sessionPath)) return [];
  return readFileSync(sessionPath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        return {
          schema: 'narada.agent_tui.live_turn_acceptance.unparseable_session_line.v0',
          event_kind: 'unparseable_session_line',
          line: index + 1,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
}

function eventKind(event) {
  return event.event_kind ?? event.kind ?? event.type ?? null;
}

function eventPayload(event) {
  return event.payload ?? event.data ?? event;
}

function validateLiveTurnEvidence({ resultPath, sessionPath, providerAdmissionOnly = false }) {
  const failures = [];
  let result = null;
  if (existsSync(resultPath)) {
    try {
      result = readJson(resultPath);
    } catch (error) {
      failures.push(`result_artifact_invalid_json:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const sessionJsonlExists = typeof sessionPath === 'string' && existsSync(sessionPath);
  const events = readSessionEvents(sessionPath);
  if (!sessionJsonlExists) failures.push('session_jsonl_missing');
  const observedEventKinds = events.map(eventKind).filter(Boolean);
  const requiredEventKinds = providerAdmissionOnly ? REQUIRED_PROVIDER_ADMISSION_EVENT_KINDS : REQUIRED_EVENT_KINDS;
  const missingEventKinds = requiredEventKinds.filter((kind) => !observedEventKinds.includes(kind));
  for (const kind of missingEventKinds) failures.push(`missing_session_event:${kind}`);

  const turnCompletedEvent = events.find((event) => eventKind(event) === 'turn_completed');
  const turnCompletedPayload = turnCompletedEvent ? eventPayload(turnCompletedEvent) : null;
  if (providerAdmissionOnly && turnCompletedPayload?.provider_execution_enabled !== true) {
    failures.push('provider_execution_not_enabled');
  }

  const toolResultEvent = events.find((event) => eventKind(event) === 'tool_result_received');
  const toolResultPayload = toolResultEvent ? eventPayload(toolResultEvent) : null;
  if (!providerAdmissionOnly && toolResultPayload) {
    if (toolResultPayload.status !== 'ok') failures.push('tool_result_status_not_ok');
    if (toolResultPayload.tool_name !== 'site_loop_status') failures.push('tool_result_tool_name_not_site_loop_status');
    if (toolResultPayload.mcp_runtime_execution !== 'supervised_stdio') failures.push('tool_result_not_supervised_stdio');
  }

  return {
    status: failures.length === 0 ? 'passed' : 'failed',
    failures,
    result,
    observed_event_kinds: observedEventKinds,
    missing_event_kinds: missingEventKinds,
    tool_result_summary: toolResultPayload
      ? {
        status: toolResultPayload.status ?? null,
        tool_name: toolResultPayload.tool_name ?? null,
        server_name: toolResultPayload.server_name ?? null,
        mcp_runtime_execution: toolResultPayload.mcp_runtime_execution ?? null,
      }
      : null,
  };
}

function writeProof(report, outputPath = null) {
  const targetPath = outputPath ?? report.latest_proof_path;
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return targetPath;
}

function defaultSpawnAgentStart({ siteRoot, identity, maxSteps, directivePath, timeoutMs, normalLaunchDefaults = false }) {
  const startAgentPath = join(DEFAULT_NARADA_PROPER_ROOT, 'packages', 'agent-start', 'src', 'narada-agent-start.ts');
  const launcherArgs = [
    '--import',
    'tsx',
    startAgentPath,
    identity,
    '--target-site-root',
    siteRoot,
    '--site-root',
    siteRoot,
    '--runtime',
    'agent-tui',
    '--exec',
    '--agent-tui-runtime-loop',
  ];
  if (!normalLaunchDefaults) {
    launcherArgs.push('--agent-tui-provider-execution', '--agent-tui-mcp-fabric');
  }
  launcherArgs.push(
    '--agent-tui-max-steps',
    String(maxSteps),
    '--agent-tui-starting-directive-file',
    directivePath,
  );
  return spawnSync(process.execPath, launcherArgs, {
    cwd: siteRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 16,
    timeout: Number(timeoutMs),
    env: {
      ...process.env,
      NARADA_PROPER_ROOT: DEFAULT_NARADA_PROPER_ROOT,
    },
  });
}

function buildReport({ siteRoot, identity, maxSteps, timeoutMs, paths, spawnResult, startedAt, finishedAt, providerAdmissionOnly = false }) {
  const stdout = spawnResult.stdout ?? '';
  const stderr = spawnResult.stderr ?? '';
  const logText = `${stdout}${stderr ? `\n${stderr}` : ''}`;
  writeFileSync(paths.runLogPath, logText, 'utf8');
  const launch = parseLaunchLog(logText, siteRoot);
  const validation = validateLiveTurnEvidence({
    resultPath: paths.resultPath,
    sessionPath: launch.session_jsonl_path,
    providerAdmissionOnly,
  });
  const report = {
    schema: REPORT_SCHEMA,
    status: spawnResult.status === 0 && validation.status === 'passed' ? 'passed' : 'failed',
    generated_at: finishedAt,
    started_at: startedAt,
    site_root: siteRoot,
    identity,
    max_steps: Number(maxSteps),
    timeout_ms: Number(timeoutMs),
    directive_path: paths.directivePath,
    result_path: paths.resultPath,
    run_log_path: paths.runLogPath,
    latest_proof_path: paths.latestProofPath,
    launch,
    process_exit_code: spawnResult.status,
    process_signal: spawnResult.signal ?? null,
    process_error: spawnResult.error ? String(spawnResult.error.message ?? spawnResult.error) : null,
    validation,
  };
  if (report.status !== 'passed' && validation.failures.length === 0) {
    report.validation.failures.push(`process_exit_not_zero:${spawnResult.status ?? 'null'}`);
  }
  return report;
}

function runAgentTuiLiveTurnAcceptance({
  siteRoot = DEFAULT_SITE_ROOT,
  identity = 'narada.resident',
  maxSteps = '2400',
  timeoutMs = 300000,
  outputPath = null,
  now = new Date(),
  normalLaunchDefaults = false,
  providerAdmissionOnly = false,
  spawnAgentStart = defaultSpawnAgentStart,
} = {}) {
  const resolvedSiteRoot = resolve(siteRoot);
  const paths = defaultAcceptancePaths(resolvedSiteRoot);
  mkdirSync(paths.dir, { recursive: true });
  const directive = buildAcceptanceDirective({
    resultRelativePath: paths.resultRelativePath,
    providerAdmissionOnly,
  });
  writeFileSync(paths.directivePath, directive, 'utf8');
  rmSync(paths.resultPath, { force: true });
  const startedAt = now instanceof Date ? now.toISOString() : String(now);
  const spawnResult = spawnAgentStart({
    siteRoot: resolvedSiteRoot,
    identity,
    maxSteps,
    timeoutMs,
    normalLaunchDefaults,
    directivePath: paths.directivePath,
    resultPath: paths.resultPath,
  });
  const finishedAt = new Date().toISOString();
  const report = buildReport({
    siteRoot: resolvedSiteRoot,
    identity,
    maxSteps,
    timeoutMs,
    paths,
    spawnResult,
    startedAt,
    finishedAt,
    providerAdmissionOnly,
  });
  report.proof_path = outputPath ?? paths.latestProofPath;
  report.timestamped_proof_path = join(paths.dir, `${timestampId(new Date(report.generated_at))}.proof.json`);
  writeProof(report, report.proof_path);
  writeProof(report, report.timestamped_proof_path);
  return report;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const report = runAgentTuiLiveTurnAcceptance({
    siteRoot: args.siteRoot,
    identity: args.identity,
    maxSteps: args.maxSteps,
    timeoutMs: args.timeoutMs,
    outputPath: args.output,
    normalLaunchDefaults: args.normalLaunchDefaults,
    providerAdmissionOnly: args.providerAdmissionOnly,
  });
  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`agent-tui live-turn acceptance: ${report.status}\n`);
    process.stdout.write(`proof_path: ${report.proof_path}\n`);
    process.stdout.write(`run_log_path: ${report.run_log_path}\n`);
    process.stdout.write(`result_path: ${report.result_path}\n`);
    if (report.status !== 'passed') {
      process.stdout.write(`failures: ${report.validation.failures.join(', ')}\n`);
    }
  }
  if (report.status !== 'passed') process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({
      schema: REPORT_SCHEMA,
      status: 'refused',
      refusals: [error instanceof Error ? error.message : String(error)],
    }, null, 2));
    process.exit(2);
  });
}

export {
  REQUIRED_EVENT_KINDS,
  buildAcceptanceDirective,
  defaultAcceptancePaths,
  parseArgs,
  parseLaunchLog,
  readSessionEvents,
  runAgentTuiLiveTurnAcceptance,
  validateLiveTurnEvidence,
  writeProof,
};
