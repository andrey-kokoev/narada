import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SCHEMA = 'narada.ai_process_invocation.v1';
const SECRET_NAME = /(key|token|secret|password|credential|cookie|authorization)/i;

export class AiProcessInvocationRefusalError extends Error {
  constructor(admission) {
    super(admission.reason ?? 'ai_process_invocation_refused');
    this.name = 'AiProcessInvocationRefusalError';
    this.code = 'ai_process_invocation_refused';
    this.admission = admission;
  }
}

function liveCapRefusal({ record, leaseDir, artifactDir, leasePath, options, allowDuplicate }) {
  const cap = Number(record.policy.max_live_codex_invocations_per_site_session);
  if (allowDuplicate || record.adapter_kind !== 'codex' || !Number.isInteger(cap) || cap <= 0) return null;
  const live = liveLeases(leaseDir, options.isPidAlive).filter((candidate) => sameSiteSessionInvocationScope(candidate, record));
  if (live.length < cap) return null;
  const refusal = {
    ...record,
    event: 'refused',
    admitted: false,
    reason: 'codex_live_invocation_cap_exceeded',
    existing_invocations: live,
    existing_invocation: live[0] ?? null,
    cleanup_hint: 'Stop or wait for an existing Codex invocation in this site/session scope, or use an explicit duplicate override when policy permits it.',
    lease_path: leasePath,
  };
  refusal.artifact_path = writeEvidenceArtifact(artifactDir, refusal);
  return refusal;
}

function liveLeases(leaseDir, isPidAliveFn) {
  let names;
  try { names = readdirSync(leaseDir); } catch { return []; }
  const leases = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const lease = readJsonIfPresent(join(leaseDir, name));
    if (lease && isPidAlive(lease.owner_pid, isPidAliveFn)) leases.push(lease);
  }
  return leases;
}

function sameSiteSessionInvocationScope(left, right) {
  return left.adapter_kind === right.adapter_kind
    && left.site_root === right.site_root
    && (left.session_id ?? null) === (right.session_id ?? null);
}

function normalizePolicy(invocation, options) {
  return {
    duplicate_override: Boolean(options.allowDuplicate ?? invocation.allowDuplicate ?? process.env.NARADA_AI_PROCESS_INVOCATION_ALLOW_DUPLICATE),
    max_live_codex_invocations_per_site_session: Number(options.maxLiveCodexInvocationsPerSiteSession ?? invocation.maxLiveCodexInvocationsPerSiteSession ?? invocation.max_live_codex_invocations_per_site_session ?? 1),
  };
}

function optionalString(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
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
  const keyParts = {
    adapter_kind: invocation.adapterKind ?? 'codex',
    projection: invocation.projection ?? 'unknown',
    purpose: invocation.purpose ?? 'runtime',
    site_root: siteRoot,
    workspace_root: workspaceRoot,
    cwd,
    agent_id: optionalString(invocation.agentId ?? invocation.agent_id),
    session_id: optionalString(invocation.sessionId ?? invocation.session_id),
    thread_id: optionalString(invocation.threadId ?? invocation.thread_id),
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
    command: keyParts.command,
    argv,
    env: summarizeEnv(invocation.env ?? invocation.environment ?? {}),
    policy: normalizePolicy(invocation, options),
    owner_pid: ownerPid,
    created_at: now instanceof Date ? now.toISOString() : new Date(now).toISOString(),
  };
}

export function admitAiProcessInvocation(invocation, options = {}) {
  const record = buildAiProcessInvocationRecord(invocation, options);
  const root = options.root ?? aiProcessInvocationRoot({ siteRoot: record.site_root, cwd: record.cwd });
  const leaseDir = join(root, 'leases');
  const leasePath = join(leaseDir, `${record.key}.json`);
  const artifactDir = join(root, 'artifacts');
  const allowDuplicate = Boolean(options.allowDuplicate ?? invocation.allowDuplicate ?? process.env.NARADA_AI_PROCESS_INVOCATION_ALLOW_DUPLICATE);
  mkdirSync(leaseDir, { recursive: true });
  mkdirSync(artifactDir, { recursive: true });

  const existing = readJsonIfPresent(leasePath);
  if (existing && isPidAlive(existing.owner_pid, options.isPidAlive) && !allowDuplicate) {
    const refusal = {
      ...record,
      event: 'refused',
      admitted: false,
      reason: 'duplicate_live_invocation',
      existing_invocation: existing,
      cleanup_hint: 'Stop the existing invocation or set NARADA_AI_PROCESS_INVOCATION_ALLOW_DUPLICATE=1 for an explicit duplicate launch.',
      lease_path: leasePath,
    };
    refusal.artifact_path = writeEvidenceArtifact(artifactDir, refusal);
    return refusal;
  }
  if (existing && !isPidAlive(existing.owner_pid, options.isPidAlive)) {
    try { rmSync(leasePath, { force: true }); } catch { /* stale lease cleanup is best effort */ }
  }

  const capRefusal = liveCapRefusal({ record, leaseDir, artifactDir, leasePath, options, allowDuplicate });
  if (capRefusal) return capRefusal;

  const admitted = { ...record, event: 'admitted', admitted: true, lease_path: leasePath };
  writeFileSync(leasePath, `${JSON.stringify(admitted, null, 2)}\n`, 'utf8');
  admitted.artifact_path = writeEvidenceArtifact(artifactDir, admitted);
  return admitted;
}

export function releaseAiProcessInvocationLease(admission, result = {}) {
  if (!admission?.admitted) return;
  const artifactDir = join(aiProcessInvocationRoot({ siteRoot: admission.site_root, cwd: admission.cwd }), 'artifacts');
  try { rmSync(admission.lease_path, { force: true }); } catch { /* best effort */ }
  try {
    writeEvidenceArtifact(artifactDir, {
      ...admission,
      event: 'exited',
      exit_code: result.exitCode ?? result.status ?? null,
      signal: result.signal ?? null,
      exited_at: new Date().toISOString(),
    });
  } catch { /* evidence failure must not mask process result */ }
}

export function runAiProcessInvocationSync(invocation, { spawnSync, spawnOptions = {}, ...admissionOptions } = {}) {
  const admission = admitAiProcessInvocation(invocation, admissionOptions);
  if (!admission.admitted) {
    const error = new AiProcessInvocationRefusalError(admission);
    return { status: 1, signal: null, stdout: '', stderr: `${error.code}: ${admission.reason}\nArtifact: ${admission.artifact_path}\n`, error, aiProcessInvocation: admission };
  }
  try {
    const result = spawnSync(invocation.command, invocation.argv ?? [], spawnOptions);
    result.aiProcessInvocation = admission;
    releaseAiProcessInvocationLease(admission, result);
    return result;
  } catch (error) {
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
    releaseAiProcessInvocationLease(admission, { status: null, signal: null });
    throw error;
  }
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
