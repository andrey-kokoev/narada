import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { runGovernedCommand } from '@narada-core/process-launch-posture';
import {
  CarrierRestartOutcomeV1Schema,
  CarrierRestartRequestV1Schema,
  type CarrierRestartOutcomeV1,
  type CarrierRestartRequestV1,
} from '@narada-core/mcp-fabric-contracts';
import { resolveNaradaSitePaths, type NaradaSitePaths } from '@narada-core/site-paths';
import {
  activateTargetAuthority,
  authorityTransitionStatePathFromSessionPath,
  beginSourceDrain,
  beginTargetActivation,
  emptyAuthorityTransitionSourceState,
  planTargetAuthorityTransition,
  prepareTargetAuthority,
  readAuthorityTransitionSourceState,
  recordAuthorityTransitionFailure,
  retireSourceAuthority,
  sealSourceAuthority,
  type NaradaAuthorityTransitionSourceState,
} from '@narada-core/nars-session-core';

const MAX_FILE_TAIL_BYTES = 128 * 1024;
const MAX_PROCESS_OUTPUT_BYTES = 32 * 1024;
const HEARTBEAT_FRESHNESS_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 60_000;

type JsonRecord = Record<string, unknown>;

export interface CarrierLaunchSpec {
  identity: string;
  operatorSurfaceKind: string;
  runtime: string;
  siteRoot: string;
  workspaceRoot: string;
  pcSiteRoot: string;
  siteId: string;
  sessionId: string;
  launchSource: string;
  mcpScope: string;
  timeoutMs: number;
}

export interface CarrierLaunchResult {
  ok: boolean;
  exit_code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  error_code?: string;
}

export interface CarrierHealthResult {
  ready: boolean;
  status: string | null;
  lifecycle_state: string | null;
  mcp_operational_state: string | null;
  endpoint: string;
  body: JsonRecord | null;
  error_code?: string;
}

export interface CarrierRestartSupervisorDependencies {
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
  launch?: (spec: CarrierLaunchSpec) => Promise<CarrierLaunchResult>;
  healthCheck?: (endpoint: string, timeoutMs: number) => Promise<CarrierHealthResult>;
}

export interface CarrierRestartSupervisorContext extends CarrierRestartSupervisorDependencies {
  siteRoot: string;
  pcSiteRoot: string;
}

export function carrierRestartOperationPath(pcSiteRoot: string, operationId: string): string {
  assertSafeFileIdentifier(operationId, 'operation_id');
  return join(resolve(pcSiteRoot), 'runtime', 'carrier-restarts', `${operationId}.json`);
}

export function readCarrierRestartOutcome(pcSiteRoot: string, operationId: string): CarrierRestartOutcomeV1 | null {
  const path = carrierRestartOperationPath(pcSiteRoot, operationId);
  if (!existsSync(path)) return null;
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  return CarrierRestartOutcomeV1Schema.parse(parsed);
}

export async function requestCarrierRestart(args: JsonRecord, context: CarrierRestartSupervisorContext): Promise<CarrierRestartOutcomeV1> {
  const now = context.now ?? (() => new Date());
  const request = parseCarrierRestartRequest(args, now());
  const operationPath = carrierRestartOperationPath(context.pcSiteRoot, request.operation_id);
  const existing = readCarrierRestartOutcome(context.pcSiteRoot, request.operation_id);
  if (existing) return existing;

  const requestedAuthorization = stringValue(args.mutating_authorized);
  const baseOutcome = {
    schema: 'narada.pc_runtime.carrier_restart_outcome.v1' as const,
    operation_id: request.operation_id,
    requested_at: request.requested_at,
    completed_at: null,
    requested_by: request.requested_by,
    site_id: request.site_id,
    source_session_id: request.carrier_session_id,
    target_session_id: null,
    source_retired: false,
    reason: request.reason,
    error_code: null,
  };

  if (request.dry_run) {
    return writeOutcome(operationPath, {
      ...baseOutcome,
      status: 'planned',
      transition_state: 'not_requested',
      evidence: {
        authority: 'pc_site_runtime',
        required_authority: 'carrier.restart',
        expected_state: request.expected_state,
        mutation_performed: false,
        target_session_id: plannedSuccessorSessionId(now()),
      },
    });
  }

  if (!requestedAuthorization) {
    return writeOutcome(operationPath, {
      ...baseOutcome,
      status: 'refused',
      transition_state: 'transition_aborted',
      error_code: 'carrier_restart_authority_missing',
      evidence: {
        required_authority: 'carrier.restart',
        mutation_performed: false,
      },
    });
  }

  return executeCarrierRestart({
    request,
    operationPath,
    baseOutcome,
    context,
    now,
  });
}

export function showCarrierRestartOutcome(pcSiteRoot: string, operationId: string): CarrierRestartOutcomeV1 {
  const outcome = readCarrierRestartOutcome(pcSiteRoot, operationId);
  if (!outcome) throw new Error(`carrier_restart_outcome_not_found:${operationId}`);
  return outcome;
}

async function executeCarrierRestart({
  request,
  operationPath,
  baseOutcome,
  context,
  now,
}: {
  request: CarrierRestartRequestV1;
  operationPath: string;
  baseOutcome: JsonRecord;
  context: CarrierRestartSupervisorContext;
  now: () => Date;
}): Promise<CarrierRestartOutcomeV1> {
  const sourcePaths = resolveNaradaSitePaths({ siteRoot: resolve(context.siteRoot), sessionId: request.carrier_session_id });
  const sourceSessionPath = requirePath(sourcePaths.narsSessionPath, 'source_session_path');
  const sourceEventsPath = requirePath(sourcePaths.narsEventsPath, 'source_events_path');
  const sourceControlPath = requirePath(sourcePaths.narsControlPath, 'source_control_path');
  const sourceIndex = readOptionalJson(sourcePaths.narsSessionIndexRecordPath);
  const sourceCarrier = readOptionalJson(join(resolve(context.pcSiteRoot), 'runtime', 'carrier-sessions', `${request.carrier_session_id}.json`));
  const sourceRecord: JsonRecord = { ...(sourceCarrier ?? {}), ...(sourceIndex ?? {}) };
  const sourceStatePath = authorityTransitionStatePathFromSessionPath(sourceSessionPath);
  const sourceState = readAuthorityTransitionSourceState(sourceStatePath);
  const baseEvidence: JsonRecord = {
    authority: 'pc_site_runtime',
    required_authority: 'carrier.restart',
    source_session_path: sourceSessionPath,
    source_events_path: sourceEventsPath,
    source_control_path: sourceControlPath,
    expected_state: request.expected_state,
    source_transition_state: sourceState.authority_transition_state,
  };

  const reject = (errorCode: string, reason: string, evidence: JsonRecord = {}): CarrierRestartOutcomeV1 => writeOutcome(operationPath, {
    ...baseOutcome,
    status: 'refused',
    transition_state: 'transition_aborted',
    error_code: errorCode,
    evidence: { ...baseEvidence, ...evidence, mutation_performed: false },
  });

  if (!sourceIndex && !sourceCarrier) return reject('carrier_source_record_missing', 'The source carrier has no durable session or PC carrier record.');
  if (sourceRecord.site_id && sourceRecord.site_id !== request.site_id) {
    return reject('carrier_site_identity_mismatch', 'The requested site_id does not match the durable source record.', {
      recorded_site_id: sourceRecord.site_id,
    });
  }
  if (sourceState.corrupt) return reject('carrier_source_transition_state_corrupt', 'The source authority transition state is corrupt.');
  if (sourceState.source_write_admission !== 'active') {
    return reject('carrier_source_not_active', 'The source carrier is not admitting active writes.', {
      source_write_admission: sourceState.source_write_admission,
    });
  }
  if (sourceRecord.status === 'closed' || sourceRecord.lifecycle_state === 'closed') {
    return reject('carrier_source_already_closed', 'The source carrier is already closed.');
  }

  const expectedMismatch = compareExpectedState(request.expected_state, sourceRecord);
  if (expectedMismatch.length > 0) {
    return reject('carrier_restart_expected_state_stale', 'The source carrier no longer matches the supplied expected state.', {
      mismatches: expectedMismatch,
    });
  }
  if (!existsSync(sourceControlPath)) return reject('carrier_source_control_missing', 'The source NARS control path is not present.');

  const targetSessionId = plannedSuccessorSessionId(now());
  const targetPaths = resolveNaradaSitePaths({ siteRoot: resolve(context.siteRoot), sessionId: targetSessionId });
  const targetSessionPath = requirePath(targetPaths.narsSessionPath, 'target_session_path');
  const targetEventsPath = requirePath(targetPaths.narsEventsPath, 'target_events_path');
  const identity = stringValue(sourceRecord.agent_id)
    ?? stringValue(sourceRecord.declared_agent_identity)
    ?? stringValue(sourceRecord.verified_agent_identity);
  if (!identity) return reject('carrier_source_identity_missing', 'The source record does not provide a launchable agent identity.');

  const operatorSurfaceKind = stringValue(sourceRecord.operator_surface_kind)
    ?? stringValue(sourceRecord.carrier)
    ?? 'agent-web-ui';
  const runtime = stringValue(sourceRecord.runtime_substrate_kind)
    ?? stringValue(sourceRecord.runtime)
    ?? 'narada-agent-runtime-server';
  const siteId = stringValue(sourceRecord.site_id) ?? request.site_id;
  const workspaceRoot = resolveNaradaSitePaths({ siteRoot: resolve(context.siteRoot) }).workspaceRoot;
  const timeoutMs = Math.max(1_000, Math.min(300_000, request.timeout_ms));
  const transitionPlan = planTargetAuthorityTransition({
    sourceAuthorityRuntimeHost: sourceState.source_authority_runtime_host ?? 'local',
    sourceAuthorityEpoch: sourceState.source_authority_epoch ?? 1,
    sourceAuthorityRuntimeId: sourceState.source_authority_runtime_id ?? `local-nars:${request.carrier_session_id}`,
    transitionId: request.operation_id,
    currentSiteRoot: resolve(context.siteRoot),
    currentSessionId: request.carrier_session_id,
    targetAuthorityLocator: {
      kind: 'local',
      site_root: resolve(context.siteRoot),
      session_id: targetSessionId,
    },
    supersededBySessionId: targetSessionId,
    authorityLocatorRef: `authority-locator:local/${targetSessionId}`,
  });
  if (transitionPlan.status !== 'ready') {
    return reject('carrier_target_transition_plan_refused', 'The NARS authority transition plan was refused.', {
      transition_plan: transitionPlan,
    });
  }

  let state = sourceState;
  try {
    state = prepareTargetAuthority({
      path: sourceStatePath,
      sessionPath: sourceSessionPath,
      state: state.authority_transition_state ? state : emptyAuthorityTransitionSourceState({ path: sourceStatePath }),
      transitionPlan,
      targetAuthorityLocator: transitionPlan.target_authority_locator,
      supersededBySessionId: targetSessionId,
      authorityLocatorRef: `authority-locator:local/${targetSessionId}`,
      reason: request.reason,
      requestedBy: request.requested_by,
      now: now(),
    });
    writeStage(operationPath, baseOutcome, 'running', 'preparing_target', targetSessionId, {
      ...baseEvidence,
      transition_plan: transitionPlan,
      target_session_path: targetSessionPath,
      target_events_path: targetEventsPath,
    });

    state = beginSourceDrain({
      path: sourceStatePath,
      sessionPath: sourceSessionPath,
      state,
      reason: request.reason,
      requestedBy: request.requested_by,
      now: now(),
    });
    writeStage(operationPath, baseOutcome, 'running', 'source_draining', targetSessionId, {
      ...baseEvidence,
    });
    appendSessionClose(sourceControlPath, request.operation_id);
    const sourceClosed = await waitForSessionClosed({
      eventsPath: sourceEventsPath,
      timeoutMs,
      dependencies: context,
    });
    if (!sourceClosed.closed) {
      throw transitionFailure('drain_failed', sourceClosed.error_code ?? 'carrier_source_drain_timeout', 'The source carrier did not confirm session closure.', {
        source_close: sourceClosed,
      });
    }

    state = sealSourceAuthority({
      path: sourceStatePath,
      sessionPath: sourceSessionPath,
      state,
      sourceLastSequence: lastEventSequence(sourceEventsPath),
      reason: 'source_session_closed',
      requestedBy: request.requested_by,
      now: now(),
    });
    writeStage(operationPath, baseOutcome, 'running', 'source_sealed', targetSessionId, {
      ...baseEvidence,
      source_close: sourceClosed,
      source_last_sequence: state.source_last_sequence,
    });

    state = beginTargetActivation({
      path: sourceStatePath,
      sessionPath: sourceSessionPath,
      state,
      targetAuthorityLocator: transitionPlan.target_authority_locator,
      supersededBySessionId: targetSessionId,
      authorityLocatorRef: `authority-locator:local/${targetSessionId}`,
      reason: 'successor_ready_after_source_seal',
      requestedBy: request.requested_by,
      now: now(),
    });
    writeStage(operationPath, baseOutcome, 'running', 'target_activating', targetSessionId, {
      ...baseEvidence,
      source_close: sourceClosed,
    });

    const launch = await (context.launch ?? defaultLaunch)({
      identity,
      operatorSurfaceKind,
      runtime,
      siteRoot: resolve(context.siteRoot),
      workspaceRoot,
      pcSiteRoot: resolve(context.pcSiteRoot),
      siteId,
      sessionId: targetSessionId,
      launchSource: 'carrier-restart-supervisor',
      mcpScope: 'all',
      timeoutMs,
    });
    if (!launch.ok) throw transitionFailure('target_activation_failed', 'carrier_target_launch_failed', 'The successor carrier launcher failed after source seal.', { launch: summarizeLaunch(launch) });

    const targetReady = await waitForTargetReady({
      targetPaths,
      timeoutMs,
      dependencies: context,
    });
    if (!targetReady.ready) {
      throw transitionFailure('target_activation_failed', targetReady.error_code ?? 'carrier_target_readiness_timeout', 'The successor carrier did not reach healthy ready state.', {
        launch: summarizeLaunch(launch),
        target_readiness: targetReady,
      });
    }

    const targetFirstSequence = firstEventSequence(targetEventsPath) ?? 1;
    const targetIndex = readOptionalJson(targetPaths.narsSessionIndexRecordPath);
    const targetAuthorityEpoch = typeof targetIndex?.authority_epoch === 'number' && Number.isInteger(targetIndex.authority_epoch) && targetIndex.authority_epoch >= 1
      ? targetIndex.authority_epoch
      : (state.source_authority_epoch ?? 1) + 1;
    const authorityEpochToken = {
      schema: 'narada.nars.authority_epoch_token.v1',
      operation_id: request.operation_id,
      source_session_id: request.carrier_session_id,
      target_session_id: targetSessionId,
      epoch: targetAuthorityEpoch,
    };
    state = activateTargetAuthority({
      path: sourceStatePath,
      sessionPath: sourceSessionPath,
      state,
      activationId: request.operation_id,
      targetFirstSequence,
      authorityEpochToken,
      targetAuthorityLocator: transitionPlan.target_authority_locator,
      supersededBySessionId: targetSessionId,
      authorityLocatorRef: `authority-locator:local/${targetSessionId}`,
      handoffEvidence: {
        source_last_sequence: state.source_last_sequence,
        target_first_sequence: targetFirstSequence,
        source_close: sourceClosed,
        target_authority_epoch: targetAuthorityEpoch,
      },
      reconciliationEvidence: {
        status: 'verified',
        target_health: targetReady,
      },
      reason: 'successor_healthy_and_source_sealed',
      requestedBy: request.requested_by,
      now: now(),
    });
    writeStage(operationPath, baseOutcome, 'running', 'target_active', targetSessionId, {
      ...baseEvidence,
      target_readiness: targetReady,
      source_close: sourceClosed,
      target_first_sequence: targetFirstSequence,
    });

    state = retireSourceAuthority({
      path: sourceStatePath,
      sessionPath: sourceSessionPath,
      state,
      reason: 'successor_active',
      requestedBy: request.requested_by,
      now: now(),
    });
    return writeOutcome(operationPath, {
      ...baseOutcome,
      completed_at: now().toISOString(),
      target_session_id: targetSessionId,
      status: 'completed',
      transition_state: 'source_retired',
      source_retired: state.source_write_admission === 'retired',
      evidence: {
        ...baseEvidence,
        target_readiness: targetReady,
        source_close: sourceClosed,
        target_first_sequence: targetFirstSequence,
        authority_transition_state: state.authority_transition_state,
        source_write_admission: state.source_write_admission,
      },
    });
  } catch (error) {
    const failure = error instanceof CarrierTransitionFailure
      ? error
      : new CarrierTransitionFailure('transition_aborted', 'carrier_restart_execution_failed', error instanceof Error ? error.message : String(error), {});
    let failureState = state;
    try {
      failureState = recordAuthorityTransitionFailure({
        path: sourceStatePath,
        sessionPath: sourceSessionPath,
        state,
        failureState: state.authority_transition_state ? failure.failureState : 'transition_aborted',
        reason: failure.reason,
        requestedBy: request.requested_by,
        now: now(),
      });
    } catch {
      // Preserve the original operation failure when a secondary state write cannot be made.
    }
    const reportedTransitionState = failureState.authority_transition_state ?? failure.failureState;
    return writeOutcome(operationPath, {
      ...baseOutcome,
      completed_at: now().toISOString(),
      target_session_id: targetSessionId,
      status: 'failed',
      transition_state: reportedTransitionState,
      error_code: failure.errorCode,
      evidence: {
        ...baseEvidence,
        ...failure.evidence,
        authority_transition_state: failureState.authority_transition_state,
        source_write_admission: failureState.source_write_admission,
        mutation_performed: true,
      },
    });
  }
}

function parseCarrierRestartRequest(args: JsonRecord, now: Date): CarrierRestartRequestV1 {
  const timeoutValue = typeof args.timeout_ms === 'number' ? args.timeout_ms : DEFAULT_TIMEOUT_MS;
  return CarrierRestartRequestV1Schema.parse({
    schema: 'narada.pc_runtime.carrier_restart_request.v1',
    operation_id: stringValue(args.operation_id),
    requested_at: stringValue(args.requested_at) ?? now.toISOString(),
    requested_by: stringValue(args.requested_by),
    site_id: stringValue(args.site_id),
    carrier_session_id: stringValue(args.carrier_session_id),
    expected_state: asRecord(args.expected_state),
    reason: stringValue(args.reason),
    timeout_ms: timeoutValue,
    dry_run: args.dry_run === true,
  });
}

async function waitForTargetReady({ targetPaths, timeoutMs, dependencies }: { targetPaths: NaradaSitePaths; timeoutMs: number; dependencies: CarrierRestartSupervisorDependencies }): Promise<CarrierHealthResult & { ready: boolean }> {
  const deadline = Date.now() + timeoutMs;
  const sleep = dependencies.sleep ?? defaultSleep;
  const healthCheck = dependencies.healthCheck ?? defaultHealthCheck;
  let last: CarrierHealthResult = {
    ready: false,
    status: null,
    lifecycle_state: null,
    mcp_operational_state: null,
    endpoint: '',
    body: null,
    error_code: 'carrier_target_session_not_started',
  };
  while (Date.now() < deadline) {
    const started = latestSessionStarted(targetPaths.narsEventsPath);
    const endpoint = stringValue(started?.health_endpoint) ?? '';
    if (endpoint) {
      last = await healthCheck(endpoint, Math.min(5_000, Math.max(1_000, deadline - Date.now())));
      if (last.ready && heartbeatIsFresh(targetPaths.narsHeartbeatPath)) return last;
    }
    await sleep(250);
  }
  return last;
}

async function waitForSessionClosed({ eventsPath, timeoutMs, dependencies }: { eventsPath: string; timeoutMs: number; dependencies: CarrierRestartSupervisorDependencies }): Promise<{ closed: boolean; error_code?: string; last_event?: JsonRecord | null }> {
  const deadline = Date.now() + timeoutMs;
  const sleep = dependencies.sleep ?? defaultSleep;
  let lastEvent: JsonRecord | null = null;
  while (Date.now() < deadline) {
    const events = readJsonlTail(eventsPath);
    lastEvent = events.at(-1) ?? null;
    if (events.some((event) => event.event === 'session_closed')) return { closed: true, last_event: lastEvent };
    await sleep(250);
  }
  return { closed: false, error_code: 'carrier_source_session_closed_event_missing', last_event: lastEvent };
}

async function defaultLaunch(spec: CarrierLaunchSpec): Promise<CarrierLaunchResult> {
  const args = [
    spec.identity,
    '--operator-surface', spec.operatorSurfaceKind,
    '--runtime', spec.runtime,
    '--target-site-id', spec.siteId,
    '--target-site-root', spec.siteRoot,
    '--workspace-root', spec.workspaceRoot,
    '--pc-site-root', spec.pcSiteRoot,
    '--launch-source', spec.launchSource,
    '--carrier-session-id', spec.sessionId,
    '--mcp-scope', spec.mcpScope,
    '--json',
    '--exec',
  ];
  const launcherCommand = process.platform === 'win32' ? 'narada-agent-start.cmd' : 'narada-agent-start';
  const child = runGovernedCommand(launcherCommand, args, {
    cwd: spec.siteRoot,
    env: {
      ...process.env,
      NARADA_PC_SITE_ROOT: spec.pcSiteRoot,
    },
  });
  return await collectChildResult(child, spec.timeoutMs);
}

async function defaultHealthCheck(endpoint: string, timeoutMs: number): Promise<CarrierHealthResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, { signal: controller.signal });
    const parsed: unknown = await response.json().catch(() => null);
    const body = asRecord(parsed);
    const status = stringValue(body.status) ?? stringValue(body.operational_posture);
    const lifecycleState = stringValue(body.lifecycle_state);
    const mcpState = stringValue(body.mcp_operational_state);
    const ready = response.ok
      && (status === 'healthy' || status === 'operational')
      && lifecycleState === 'ready'
      && mcpState !== 'starting';
    return {
      ready,
      status,
      lifecycle_state: lifecycleState,
      mcp_operational_state: mcpState,
      endpoint,
      body,
      ...(ready ? {} : { error_code: 'carrier_target_health_not_ready' }),
    };
  } catch {
    return {
      ready: false,
      status: null,
      lifecycle_state: null,
      mcp_operational_state: null,
      endpoint,
      body: null,
      error_code: 'carrier_target_health_unreachable',
    };
  } finally {
    clearTimeout(timer);
  }
}

function appendSessionClose(controlPath: string, operationId: string): void {
  appendFileSync(controlPath, `${JSON.stringify({
    id: `carrier_restart_${operationId}_close`,
    method: 'session.close',
    params: { source: 'carrier_restart_request', operation_id: operationId },
  })}\n`, 'utf8');
}

function writeStage(operationPath: string, baseOutcome: JsonRecord, status: 'running', transitionState: CarrierRestartOutcomeV1['transition_state'], targetSessionId: string, evidence: JsonRecord): CarrierRestartOutcomeV1 {
  return writeOutcome(operationPath, {
    ...baseOutcome,
    target_session_id: targetSessionId,
    status,
    transition_state: transitionState,
    evidence,
  });
}

function writeOutcome(operationPath: string, outcome: JsonRecord): CarrierRestartOutcomeV1 {
  const parsed = CarrierRestartOutcomeV1Schema.parse(outcome);
  mkdirSync(dirname(operationPath), { recursive: true });
  const temporaryPath = `${operationPath}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
  renameSync(temporaryPath, operationPath);
  return parsed;
}

function compareExpectedState(expected: CarrierRestartRequestV1['expected_state'], source: JsonRecord): string[] {
  const mismatches: string[] = [];
  const sourceManifest = stringValue(source.manifest_digest);
  const sourceObservation = stringValue(source.observation_digest) ?? stringValue(asRecord(source.runtime_observation).observation_digest);
  const sourceDescriptor = stringValue(source.descriptor_digest);
  if (expected.manifest_digest && sourceManifest && expected.manifest_digest !== sourceManifest) mismatches.push('manifest_digest');
  if (sourceObservation && expected.observation_digest !== sourceObservation) mismatches.push('observation_digest');
  if (expected.descriptor_digest && sourceDescriptor && expected.descriptor_digest !== sourceDescriptor) mismatches.push('descriptor_digest');
  return mismatches;
}

function latestSessionStarted(path: string | undefined): JsonRecord | null {
  return readJsonlTail(path).reverse().find((event) => event.event === 'session_started') ?? null;
}

function firstEventSequence(path: string): number | null {
  const sequence = readJsonlTail(path).find((event) => positiveInteger(event.sequence))?.sequence;
  return typeof sequence === 'number' ? sequence : null;
}

function lastEventSequence(path: string): number {
  const events = readJsonlTail(path);
  const sequence = [...events].reverse().find((event) => typeof event.sequence === 'number' && Number.isInteger(event.sequence) && event.sequence >= 0)?.sequence;
  return typeof sequence === 'number' ? sequence : 0;
}

function readJsonlTail(path: string | undefined): JsonRecord[] {
  if (!path || !existsSync(path)) return [];
  const file = readFileSync(path);
  const text = file.length > MAX_FILE_TAIL_BYTES ? file.subarray(file.length - MAX_FILE_TAIL_BYTES).toString('utf8') : file.toString('utf8');
  return text.split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try {
      const parsed: unknown = JSON.parse(line);
      return isRecord(parsed) ? [parsed] : [];
    } catch {
      return [];
    }
  });
}

function heartbeatIsFresh(path: string | undefined): boolean {
  if (!path || !existsSync(path)) return false;
  try {
    const parsed = asRecord(JSON.parse(readFileSync(path, 'utf8')));
    const declaredAt = Date.parse(stringValue(parsed.last_written_at) ?? stringValue(parsed.generated_at) ?? '');
    const observedAt = Number.isFinite(declaredAt) ? declaredAt : statSync(path).mtimeMs;
    return Date.now() - observedAt <= HEARTBEAT_FRESHNESS_MS;
  } catch {
    return false;
  }
}

async function collectChildResult(child: ReturnType<typeof runGovernedCommand>, timeoutMs: number): Promise<CarrierLaunchResult> {
  return await new Promise((resolveResult) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const append = (current: string, chunk: unknown): string => {
      const next = `${current}${String(chunk)}`;
      return next.length > MAX_PROCESS_OUTPUT_BYTES ? next.slice(next.length - MAX_PROCESS_OUTPUT_BYTES) : next;
    };
    const settle = (result: CarrierLaunchResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveResult(result);
    };
    child.stdout?.on('data', (chunk: unknown) => { stdout = append(stdout, chunk); });
    child.stderr?.on('data', (chunk: unknown) => { stderr = append(stderr, chunk); });
    child.once('error', (error: Error) => settle({ ok: false, exit_code: null, signal: null, stdout, stderr, error_code: error.message }));
    child.once('close', (code: number | null, signal: NodeJS.Signals | null) => settle({ ok: code === 0, exit_code: code, signal, stdout, stderr }));
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      settle({ ok: false, exit_code: null, signal: 'SIGTERM', stdout, stderr, error_code: 'carrier_launcher_timeout' });
    }, timeoutMs);
  });
}

function summarizeLaunch(result: CarrierLaunchResult): JsonRecord {
  return {
    ok: result.ok,
    exit_code: result.exit_code,
    signal: result.signal,
    error_code: result.error_code ?? null,
    stdout_tail: result.stdout.slice(-MAX_PROCESS_OUTPUT_BYTES),
    stderr_tail: result.stderr.slice(-MAX_PROCESS_OUTPUT_BYTES),
  };
}

function plannedSuccessorSessionId(now: Date): string {
  const stamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `carrier_${stamp}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

function readOptionalJson(path: string | undefined): JsonRecord | null {
  if (!path || !existsSync(path)) return null;
  try {
    return asRecord(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return null;
  }
}

function requirePath(path: string | undefined, name: string): string {
  if (!path) throw new Error(`${name}_missing`);
  return path;
}

function asRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function assertSafeFileIdentifier(value: string, field: string): void {
  if (!/^[A-Za-z0-9:_-]+$/.test(value)) throw new Error(`${field}_unsafe_file_identifier`);
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

class CarrierTransitionFailure extends Error {
  readonly reason: string;
  readonly failureState: 'preparation_failed' | 'drain_failed' | 'seal_failed' | 'target_activation_failed' | 'transition_aborted';
  readonly errorCode: string;
  readonly evidence: JsonRecord;

  constructor(
    failureState: 'preparation_failed' | 'drain_failed' | 'seal_failed' | 'target_activation_failed' | 'transition_aborted',
    errorCode: string,
    message: string,
    evidence: JsonRecord,
  ) {
    super(message);
    this.failureState = failureState;
    this.errorCode = errorCode;
    this.evidence = evidence;
    this.reason = message;
  }
}

function transitionFailure(
  failureState: CarrierTransitionFailure['failureState'],
  errorCode: string,
  message: string,
  evidence: JsonRecord,
): CarrierTransitionFailure {
  return new CarrierTransitionFailure(failureState, errorCode, message, evidence);
}
