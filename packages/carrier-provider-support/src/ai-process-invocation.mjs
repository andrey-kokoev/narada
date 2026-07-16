import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runHiddenPostureCommandSync } from '@narada2/process-launch-posture';
import {
  aiProcessInvocationEventForState,
  transitionAiProcessInvocation,
} from './ai-process-invocation-state.mjs';

const SCHEMA = 'narada.ai_process_invocation.v2';
const SECRET_NAME = /(key|token|secret|password|credential|cookie|authorization)/i;
const INVOCATION_SCOPE_KIND = 'narada_runtime_session';
const PROCESS_START_IDENTITY = process.env.NARADA_PROCESS_START_IDENTITY?.trim() || `proc_${randomUUID()}`;

export class AiProcessInvocationRefusalError extends Error {
  constructor(admission) {
    super(admission.reason ?? 'ai_process_invocation_refused');
    this.name = 'AiProcessInvocationRefusalError';
    this.code = 'ai_process_invocation_refused';
    this.admission = admission;
  }
}

function processIdentityPath(root, pid) {
  return join(root, 'processes', `${Number(pid)}.json`);
}

function registerProcessIdentity(root, pid, identity) {
  if (!optionalString(identity) || !Number.isInteger(Number(pid)) || Number(pid) <= 0) return;
  const path = processIdentityPath(root, pid);
  mkdirSync(join(root, 'processes'), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ schema: 'narada.ai_process_process_identity.v1', pid: Number(pid), start_identity: identity, recorded_at: new Date().toISOString() }, null, 2)}\n`, 'utf8');
}

function processStartIdentityFor(root, pid, custom) {
  if (custom) return optionalString(custom(Number(pid), root));
  if (Number(pid) === process.pid) return PROCESS_START_IDENTITY;
  return optionalString(readJsonIfPresent(processIdentityPath(root, pid))?.start_identity);
}

function isLiveLease(lease, siteRoot, options) {
  if (!isPidAlive(lease?.owner_pid, options.isPidAlive)) return false;
  const recordedIdentity = optionalString(lease.owner_process_start_identity);
  if (!recordedIdentity) return false;
  const currentIdentity = processStartIdentityFor(
    options.root ?? aiProcessInvocationRoot({ siteRoot }),
    lease.owner_pid,
    options.getProcessStartIdentity,
  );
  return Boolean(currentIdentity && currentIdentity === recordedIdentity);
}

function transitionAndWrite(admission, nextState, evidence, artifactDir) {
  const next = transitionAiProcessInvocation({ ...admission, ...evidence }, nextState, evidence);
  Object.assign(admission, next);
  admission.artifact_path = writeEvidenceArtifact(artifactDir, admission);
  return admission;
}

function leaseRoot(admission) {
  return admission?.lease_path ? resolve(admission.lease_path, '..', '..') : aiProcessInvocationRoot({ siteRoot: admission.site_root, cwd: admission.cwd });
}

function liveCapRefusal({ record, leaseDir, artifactDir, leasePath, options, allowDuplicate }) {
  const cap = Number(record.policy.max_live_codex_invocations_per_runtime_session);
  if (allowDuplicate || record.adapter_kind !== 'codex' || !Number.isInteger(cap) || cap <= 0) return null;
  const scan = scanLiveLeases(leaseDir, options, record.site_root);
  const live = scan.verified.filter((candidate) => sameInvocationScope(candidate, record));
  if (live.length < cap) return null;
  const refusal = transitionAiProcessInvocation({
    ...record,
    admitted: false,
    reason: 'codex_live_invocation_cap_exceeded',
    existing_invocations: live,
    existing_invocation: live[0] ?? null,
    unverified_live_invocations: scan.unverified,
    cleanup_hint: 'Stop or wait for an existing Codex invocation in this site/session scope, or use an explicit duplicate override when policy permits it.',
    lease_path: leasePath,
  }, 'refused', { reason: 'codex_live_invocation_cap_exceeded' });
  refusal.artifact_path = writeEvidenceArtifact(artifactDir, refusal);
  return refusal;
}

function scanLiveLeases(leaseDir, options, siteRoot) {
  let names;
  try { names = readdirSync(leaseDir); } catch { return { verified: [], unverified: [] }; }
  const verified = [];
  const unverified = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const lease = readJsonIfPresent(join(leaseDir, name));
    if (!lease || !isPidAlive(lease.owner_pid, options.isPidAlive)) continue;
    if (isLiveLease(lease, siteRoot, options)) verified.push(lease);
    else unverified.push({
      id: lease.id ?? null,
      owner_pid: lease.owner_pid ?? null,
      reason: lease.owner_process_start_identity ? 'process_start_identity_mismatch' : 'legacy_process_identity_missing',
      invocation_scope: lease.invocation_scope ?? null,
    });
  }
  return { verified, unverified };
}

function sameInvocationScope(left, right) {
  if (!isCanonicalInvocationScope(left.invocation_scope) || !isCanonicalInvocationScope(right.invocation_scope)) return false;
  return left.adapter_kind === right.adapter_kind
    && left.site_root === right.site_root
    && left.invocation_scope.site_root === right.invocation_scope.site_root
    && left.invocation_scope.runtime_session_id === right.invocation_scope.runtime_session_id;
}

function normalizePolicy(invocation, options) {
  return {
    duplicate_override: Boolean(options.allowDuplicate ?? invocation.allowDuplicate ?? process.env.NARADA_AI_PROCESS_INVOCATION_ALLOW_DUPLICATE),
    max_live_codex_invocations_per_runtime_session: Number(
      options.maxLiveCodexInvocationsPerRuntimeSession
        ?? options.maxLiveCodexInvocationsPerSiteSession
        ?? invocation.maxLiveCodexInvocationsPerRuntimeSession
        ?? invocation.maxLiveCodexInvocationsPerSiteSession
        ?? invocation.max_live_codex_invocations_per_runtime_session
        ?? invocation.max_live_codex_invocations_per_site_session
        ?? 1,
    ),
  };
}

function optionalString(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function normalizeInvocationScope(invocation, siteRoot) {
  const input = invocation.invocationScope ?? invocation.invocation_scope ?? {};
  const runtimeSessionId = optionalString(
    input.runtime_session_id
      ?? input.runtimeSessionId
      ?? invocation.runtimeSessionId
      ?? invocation.sessionId
      ?? invocation.session_id,
  );
  if (!runtimeSessionId) return null;
  return {
    schema: 'narada.ai_process_invocation_scope.v1',
    kind: INVOCATION_SCOPE_KIND,
    site_id: optionalString(input.site_id ?? input.siteId ?? invocation.siteId ?? invocation.site_id),
    site_root: siteRoot,
    runtime_session_id: runtimeSessionId,
    agent_identity_ref: input.agent_identity_ref ?? input.agentIdentityRef ?? invocation.agentIdentityRef ?? null,
    launch_session_id: optionalString(input.launch_session_id ?? input.launchSessionId ?? invocation.launchSessionId),
  };
}

function isCanonicalInvocationScope(scope) {
  return Boolean(
    scope
      && scope.kind === INVOCATION_SCOPE_KIND
      && optionalString(scope.site_root)
      && optionalString(scope.runtime_session_id),
  );
}

export function aiProcessInvocationRoot({ siteRoot, cwd } = {}) {
  return join(resolve(siteRoot ?? cwd ?? process.cwd()), '.ai', 'runtime', 'ai-process-invocation');
}

export function buildAiProcessInvocationRecord(invocation, options = {}) {
  const { now = new Date(), ownerPid = process.pid } = options;
  const siteRoot = resolve(invocation.siteRoot ?? invocation.cwd ?? process.cwd());
  const cwd = resolve(invocation.cwd ?? siteRoot);
  const workspaceRoot = resolve(invocation.workspaceRoot ?? invocation.workspace_root ?? cwd);
  const argv = [...(invocation.argv ?? [])].map(String);
  const invocationScope = normalizeInvocationScope(invocation, siteRoot);
  const ownerProcessStartIdentity = optionalString(
    options.ownerProcessStartIdentity
      ?? invocation.ownerProcessStartIdentity
      ?? PROCESS_START_IDENTITY,
  );
  const keyParts = {
    adapter_kind: invocation.adapterKind ?? 'codex',
    projection: invocation.projection ?? 'unknown',
    purpose: invocation.purpose ?? 'runtime',
    site_root: siteRoot,
    workspace_root: workspaceRoot,
    cwd,
    agent_id: optionalString(invocation.agentId ?? invocation.agent_id),
    session_id: optionalString(invocationScope?.runtime_session_id ?? invocation.sessionId ?? invocation.session_id),
    thread_id: optionalString(invocation.threadId ?? invocation.thread_id),
    invocation_scope: invocationScope,
    command: String(invocation.command ?? ''),
    argv,
  };
  const key = createHash('sha256').update(JSON.stringify(keyParts)).digest('hex');
  return {
    schema: SCHEMA,
    id: key.slice(0, 16),
    key,
    key_parts: keyParts,
    adapter_kind: keyParts.adapter_kind,
    projection: keyParts.projection,
    purpose: keyParts.purpose,
    site_root: siteRoot,
    workspace_root: workspaceRoot,
    cwd,
    agent_id: keyParts.agent_id,
    session_id: keyParts.session_id,
    thread_id: keyParts.thread_id,
    invocation_scope: invocationScope,
    command: keyParts.command,
    argv,
    env: summarizeEnv(invocation.env ?? invocation.environment ?? {}),
    policy: normalizePolicy(invocation, options),
    owner_pid: ownerPid,
    owner_process_start_identity: ownerProcessStartIdentity,
    created_at: now instanceof Date ? now.toISOString() : new Date(now).toISOString(),
    event: aiProcessInvocationEventForState('planned'),
    lifecycle_state: 'planned',
    terminal_state: null,
    lifecycle_history: [],
  };
}

export function admitAiProcessInvocation(invocation, options = {}) {
  const record = buildAiProcessInvocationRecord(invocation, options);
  const root = options.root ?? aiProcessInvocationRoot({ siteRoot: record.site_root, cwd: record.cwd });
  const leaseDir = join(root, 'leases');
  const leasePath = join(leaseDir, `${record.key}.json`);
  const artifactDir = join(root, 'artifacts');
  const admissionOptions = { ...options, root };
  const allowDuplicate = Boolean(options.allowDuplicate ?? invocation.allowDuplicate ?? process.env.NARADA_AI_PROCESS_INVOCATION_ALLOW_DUPLICATE);
  mkdirSync(leaseDir, { recursive: true });
  mkdirSync(artifactDir, { recursive: true });

  if (!isCanonicalInvocationScope(record.invocation_scope)) {
    const refusal = transitionAiProcessInvocation({
      ...record,
      admitted: false,
      reason: 'invocation_scope_missing',
      cleanup_hint: 'Provide an explicit Narada runtime-session invocation scope before starting a Codex process.',
      lease_path: leasePath,
    }, 'refused', { reason: 'invocation_scope_missing' });
    refusal.artifact_path = writeEvidenceArtifact(artifactDir, refusal);
    return refusal;
  }

  registerProcessIdentity(root, record.owner_pid, record.owner_process_start_identity);

  const existing = readJsonIfPresent(leasePath);
  if (existing && isLiveLease(existing, record.site_root, admissionOptions) && !allowDuplicate) {
    const refusal = transitionAiProcessInvocation({
      ...record,
      admitted: false,
      reason: 'duplicate_live_invocation',
      existing_invocation: existing,
      cleanup_hint: 'Stop the existing invocation or set NARADA_AI_PROCESS_INVOCATION_ALLOW_DUPLICATE=1 for an explicit duplicate launch.',
      lease_path: leasePath,
    }, 'refused', { reason: 'duplicate_live_invocation' });
    refusal.artifact_path = writeEvidenceArtifact(artifactDir, refusal);
    return refusal;
  }
  if (existing && !isLiveLease(existing, record.site_root, admissionOptions)) {
    try { rmSync(leasePath, { force: true }); } catch { /* stale lease cleanup is best effort */ }
  }

  const scan = scanLiveLeases(leaseDir, admissionOptions, record.site_root);
  record.admission_diagnostics = {
    unverified_live_invocation_count: scan.unverified.length,
  };
  const capRefusal = liveCapRefusal({ record, leaseDir, artifactDir, leasePath, options: admissionOptions, allowDuplicate });
  if (capRefusal) return capRefusal;

  const admitted = transitionAiProcessInvocation({ ...record, admitted: true, lease_path: leasePath }, 'admitted', { reason: 'lease_created' });
  writeFileSync(leasePath, `${JSON.stringify(admitted, null, 2)}\n`, 'utf8');
  admitted.artifact_path = writeEvidenceArtifact(artifactDir, admitted);
  return admitted;
}

export function releaseAiProcessInvocationLease(admission, result = {}) {
  if (!admission?.admitted || admission.lifecycle_state === 'refused') return admission;
  const artifactDir = join(leaseRoot(admission), 'artifacts');
  try { rmSync(admission.lease_path, { force: true }); } catch { /* best effort */ }
  try {
    if (admission.lifecycle_state === 'spawned') {
      transitionAndWrite(admission, 'exited', {
        exit_code: result.exitCode ?? result.status ?? null,
        signal: result.signal ?? null,
        exited_at: new Date().toISOString(),
      }, artifactDir);
    }
    if (admission.lifecycle_state === 'admitted') {
      transitionAndWrite(admission, 'failed', { reason: 'lease_released_before_spawn' }, artifactDir);
    }
    if (admission.lifecycle_state === 'exited' || admission.lifecycle_state === 'failed' || admission.lifecycle_state === 'interrupted') {
      transitionAndWrite(admission, 'released', { reason: 'lease_removed' }, artifactDir);
    }
  } catch { /* evidence failure must not mask process result */ }
  return admission;
}

function defaultAiProcessInvocationRunner(command, args, options) {
  return runHiddenPostureCommandSync(command, args, { ...options, posture: 'provider_subprocess' });
}

export function runAiProcessInvocationSync(invocation, { runProcessSync, spawnSync, spawnOptions = {}, ...admissionOptions } = {}) {
  const admission = admitAiProcessInvocation(invocation, admissionOptions);
  if (!admission.admitted) {
    const error = new AiProcessInvocationRefusalError(admission);
    return { status: 1, signal: null, stdout: '', stderr: `${error.code}: ${admission.reason}\nArtifact: ${admission.artifact_path}\n`, error, aiProcessInvocation: admission };
  }
  const runner = runProcessSync ?? spawnSync ?? defaultAiProcessInvocationRunner;
  try {
    transitionAndWrite(admission, 'spawned', { mode: 'sync' }, join(leaseRoot(admission), 'artifacts'));
    const result = runner(invocation.command, invocation.argv ?? [], spawnOptions);
    result.aiProcessInvocation = admission;
    releaseAiProcessInvocationLease(admission, result);
    return result;
  } catch (error) {
    transitionAndWrite(admission, 'failed', { error: error instanceof Error ? error.message : String(error) }, join(leaseRoot(admission), 'artifacts'));
    releaseAiProcessInvocationLease(admission, { status: null, signal: null });
    throw error;
  }
}

export function spawnAiProcessInvocation(invocation, { spawnProcess, spawnOptions = {}, ...admissionOptions } = {}) {
  const admission = admitAiProcessInvocation(invocation, admissionOptions);
  if (!admission.admitted) throw new AiProcessInvocationRefusalError(admission);
  let processOwner;
  try {
    processOwner = spawnProcess(invocation.command, invocation.argv ?? [], spawnOptions);
  } catch (error) {
    transitionAndWrite(admission, 'failed', { error: error instanceof Error ? error.message : String(error) }, join(leaseRoot(admission), 'artifacts'));
    releaseAiProcessInvocationLease(admission, { status: null, signal: null });
    throw error;
  }
  transitionAndWrite(admission, 'spawned', { mode: 'async' }, join(leaseRoot(admission), 'artifacts'));
  const child = processOwner?.child ?? processOwner;
  child?.once?.('close', (code, signal) => releaseAiProcessInvocationLease(admission, { exitCode: code, signal }));
  child?.once?.('error', () => releaseAiProcessInvocationLease(admission, { exitCode: null, signal: null }));
  return { ...processOwner, aiProcessInvocation: admission };
}

function summarizeEnv(env) {
  const summary = {};
  for (const [key, value] of Object.entries(env ?? {})) {
    if (SECRET_NAME.test(key)) summary[key] = '<redacted>';
    else if (['CODEX_HOME', 'CODEX_CONFIG_DIR', 'NARADA_SITE_ROOT', 'NARADA_WORKSPACE_ROOT', 'NARADA_AGENT_ID'].includes(key)) summary[key] = String(value ?? '');
  }
  return summary;
}

function readJsonIfPresent(path) {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

function isPidAlive(pid, custom) {
  if (!Number.isInteger(Number(pid)) || Number(pid) <= 0) return false;
  if (custom) return Boolean(custom(Number(pid)));
  try { process.kill(Number(pid), 0); return true; } catch { return false; }
}

function writeEvidenceArtifact(artifactDir, evidence) {
  mkdirSync(artifactDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const path = join(artifactDir, `${stamp}-${evidence.event}-${evidence.id}.json`);
  writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  return path;
}
