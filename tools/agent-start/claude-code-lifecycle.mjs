import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const LIFECYCLE_STATES = [
  'start',
  'ready',
  'resumed',
  'interrupted',
  'handoff_requested',
  'close_requested',
  'closed',
  'failed',
];

function lifecycleDir(siteRoot, carrierSessionId) {
  return join(siteRoot, '.narada', 'crew', 'claude-code-sessions', carrierSessionId);
}

function eventPath(siteRoot, carrierSessionId, state, index) {
  return join(lifecycleDir(siteRoot, carrierSessionId), `${String(index).padStart(2, '0')}-${state}.json`);
}

function listLifecycleEventPaths(siteRoot, carrierSessionId) {
  const dir = lifecycleDir(siteRoot, carrierSessionId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => join(dir, name))
    .sort();
}

function latestLifecyclePath(siteRoot) {
  const root = join(siteRoot, '.narada', 'crew', 'claude-code-sessions');
  if (!existsSync(root)) return null;
  const paths = [];
  for (const sessionDir of readdirSync(root)) {
    const fullDir = join(root, sessionDir);
    if (!statSync(fullDir).isDirectory()) continue;
    for (const path of listLifecycleEventPaths(siteRoot, sessionDir)) {
      paths.push({ path, mtimeMs: statSync(path).mtimeMs });
    }
  }
  paths.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return paths[0]?.path ?? null;
}

function lifecycleEvent({ siteRoot, launchResult, processAttempt, state, index, now, runtimeHandle = null, startupHydrationResult = null, closeoutPosture = null, failure = null }) {
  if (!LIFECYCLE_STATES.includes(state)) throw new Error(`unsupported_lifecycle_state:${state}`);
  return {
    schema: 'narada.agent_start.claude_code_lifecycle_event.v0',
    state,
    recorded_at: now ?? new Date().toISOString(),
    agent_id: launchResult.identity,
    agent_start_event_id: launchResult.agent_start_event,
    carrier_session_id: launchResult.carrier_session_id,
    runtime_handle: runtimeHandle,
    startup_hydration_result: startupHydrationResult,
    closeout_posture: closeoutPosture,
    failure,
    launch_result_path: launchResult.launch_result_path ?? null,
    process_attempt_path: launchResult.claude_code_process_attempt_path ?? null,
    process_attempt: processAttempt,
    authority_posture: {
      effectful_narada_authority_admitted: false,
      withheld_authorities: launchResult.claude_code_launch.execution_policy.effectful_narada_authority.withheld_authorities,
    },
    reconstruction_inputs: [
      'launch_result',
      'process_attempt',
      'lifecycle_events',
    ],
    index,
    path: eventPath(siteRoot, launchResult.carrier_session_id, state, index),
  };
}

function writeLifecycleEvent(options) {
  const event = lifecycleEvent(options);
  mkdirSync(lifecycleDir(options.siteRoot, options.launchResult.carrier_session_id), { recursive: true });
  writeFileSync(event.path, `${JSON.stringify(event, null, 2)}\n`, 'utf8');
  return event;
}

function reconstructSession(siteRoot, carrierSessionId) {
  const events = listLifecycleEventPaths(siteRoot, carrierSessionId)
    .map((path) => JSON.parse(readFileSync(path, 'utf8')))
    .sort((a, b) => a.index - b.index);
  const latest = events[events.length - 1] ?? null;
  return {
    schema: 'narada.agent_start.claude_code_session_reconstruction.v0',
    carrier_session_id: carrierSessionId,
    current_state: latest?.state ?? 'unknown',
    event_count: events.length,
    event_paths: events.map((event) => event.path),
    runtime_handle: latest?.runtime_handle ?? null,
    startup_hydration_result: [...events].reverse().find((event) => event.startup_hydration_result)?.startup_hydration_result ?? null,
    closeout_posture: latest?.closeout_posture ?? null,
    effectful_narada_authority_admitted: false,
    direct_sqlite_inspection_required: false,
  };
}

function latestSessionReadback(siteRoot) {
  const latestPath = latestLifecyclePath(siteRoot);
  if (!latestPath) {
    return {
      schema: 'narada.agent_start.claude_code_session_readback.v0',
      status: 'none',
      current_state: null,
      carrier_session_id: null,
      direct_sqlite_inspection_required: false,
    };
  }
  const latest = JSON.parse(readFileSync(latestPath, 'utf8'));
  const reconstruction = reconstructSession(siteRoot, latest.carrier_session_id);
  return {
    schema: 'narada.agent_start.claude_code_session_readback.v0',
    status: 'ok',
    current_state: reconstruction.current_state,
    carrier_session_id: latest.carrier_session_id,
    latest_event_path: latestPath,
    runtime_handle: reconstruction.runtime_handle,
    direct_sqlite_inspection_required: false,
    effectful_narada_authority_admitted: false,
  };
}

function materializeLifecycleFixture({ siteRoot, launchResult, processAttempt, now = '2026-05-15T20:00:00.000Z' }) {
  const states = [
    'start',
    'ready',
    'resumed',
    'interrupted',
    'handoff_requested',
    'close_requested',
    'closed',
    'failed',
  ];
  return states.map((state, index) => writeLifecycleEvent({
    siteRoot,
    launchResult,
    processAttempt,
    state,
    index,
    now,
    runtimeHandle: { kind: 'pid_or_external_handle', value: 'fixture-handle' },
    startupHydrationResult: state === 'ready' ? { status: 'hydrated', startup_command: 'agent_context_startup_sequence' } : null,
    closeoutPosture: state === 'closed' ? { status: 'closed_with_evidence', handoff_required: false } : null,
    failure: state === 'failed' ? { reason: 'fixture_failure_after_close', terminal: false } : null,
  }));
}

export {
  LIFECYCLE_STATES,
  latestSessionReadback,
  lifecycleEvent,
  materializeLifecycleFixture,
  reconstructSession,
  writeLifecycleEvent,
};
