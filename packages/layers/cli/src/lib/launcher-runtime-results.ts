import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  evaluateAgentStartHandoff,
  resolveAgentStartSessionProjection,
} from '@narada2/agent-start/launch-result-v0-contract';
import type { LaunchResultSummary } from './launcher-contracts.js';
import type { AgentStartResultV0 } from '@narada2/agent-start/launch-result-v0-contract';
import { AgentStartArtifactError, parseAgentStartResultText } from './agent-start-result-reader.js';

const LAUNCH_RESULT_RECONCILIATION_SCHEMA = 'narada.agent_start_result_reconciliation.v1';
const LAUNCH_RESULT_RECONCILIATION_STATUS = 'completed';
const RECONCILIATION_LOCK_TIMEOUT_MS = 5000;
const RECONCILIATION_LOCK_POLL_MS = 25;
const RECONCILIATION_LOCK_STALE_MS = 30000;

type LaunchResultReconciliationArtifact = {
  path: string;
  sha256: string;
  reason_code: string;
  detail: string;
  deleted_at?: string;
};

interface LaunchResultReconciliationReceipt {
  schema: typeof LAUNCH_RESULT_RECONCILIATION_SCHEMA;
  status: 'pending' | 'completed';
  version: 1;
  launch_results_dir: string;
  started_at: string;
  completed_at?: string;
  deleted_artifacts: LaunchResultReconciliationArtifact[];
}

type ReconciliationLockRecord = {
  pid: number;
  token: string;
  acquired_at: string;
};

function normalizedPath(path: string): string {
  const resolved = resolve(path);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isReceiptArtifact(value: unknown, launchResultsDir: string): value is LaunchResultReconciliationArtifact {
  if (!value || typeof value !== 'object') return false;
  const artifact = value as Partial<LaunchResultReconciliationArtifact>;
  const relativePath = typeof artifact.path === 'string'
    ? relative(resolve(launchResultsDir), resolve(artifact.path))
    : '';
  const isWithinLaunchResultsDir = relativePath.length > 0
    && relativePath !== '..'
    && !relativePath.startsWith(`..${sep}`)
    && !isAbsolute(relativePath);
  return isWithinLaunchResultsDir
    && typeof artifact.sha256 === 'string'
    && /^[0-9a-f]{64}$/.test(artifact.sha256)
    && typeof artifact.reason_code === 'string'
    && artifact.reason_code.length > 0
    && typeof artifact.detail === 'string'
    && artifact.detail.length > 0
    && (artifact.deleted_at === undefined || typeof artifact.deleted_at === 'string');
}

function isCompletedReconciliationReceipt(
  value: unknown,
  launchResultsDir: string,
): value is LaunchResultReconciliationReceipt {
  if (!value || typeof value !== 'object') return false;
  const receipt = value as Partial<LaunchResultReconciliationReceipt>;
  return receipt.schema === LAUNCH_RESULT_RECONCILIATION_SCHEMA
    && receipt.status === LAUNCH_RESULT_RECONCILIATION_STATUS
    && receipt.version === 1
    && typeof receipt.launch_results_dir === 'string'
    && normalizedPath(receipt.launch_results_dir) === normalizedPath(launchResultsDir)
    && typeof receipt.started_at === 'string'
    && typeof receipt.completed_at === 'string'
    && Array.isArray(receipt.deleted_artifacts)
    && receipt.deleted_artifacts.every((artifact) => isReceiptArtifact(artifact, launchResultsDir));
}

function parseLaunchResultForDiscovery(raw: string, path: string): AgentStartResultV0 {
  const record = parseAgentStartResultText(raw, path);
  const handoff = evaluateAgentStartHandoff(record);
  if (record.status === 'materialized' && !handoff.eligible) {
    throw new AgentStartArtifactError(
      handoff.reason ?? 'agent_start_result_not_attachable',
      handoff.detail ?? 'The materialized result cannot be attached.',
      path,
    );
  }
  return record;
}

function listInvalidLaunchResults(launchResultsDir: string): LaunchResultReconciliationArtifact[] {
  if (!existsSync(launchResultsDir)) return [];
  return readdirSync(launchResultsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.result.json'))
    .flatMap((entry) => {
      const path = join(launchResultsDir, entry.name);
      const raw = readFileSync(path, 'utf8');
      try {
        parseLaunchResultForDiscovery(raw, path);
        return [];
      } catch (error) {
        if (!(error instanceof AgentStartArtifactError)) throw error;
        return [{
          path,
          sha256: createHash('sha256').update(raw).digest('hex'),
          reason_code: error.reason_code,
          detail: error.message,
        }];
      }
    });
}

function writeJsonAtomically(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) throw new Error(`agent_start_result_reconciliation_target_exists: ${path}`);
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    renameSync(temporaryPath, path);
  } finally {
    if (existsSync(temporaryPath)) rmSync(temporaryPath, { force: true });
  }
}

function sleepForReconciliationLock(): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RECONCILIATION_LOCK_POLL_MS);
}

function acquireReconciliationLock(lockPath: string): () => void {
  mkdirSync(dirname(lockPath), { recursive: true });
  const token = randomUUID();
  const deadline = Date.now() + RECONCILIATION_LOCK_TIMEOUT_MS;

  while (true) {
    try {
      const fd = openSync(lockPath, 'wx');
      try {
        writeFileSync(fd, JSON.stringify({
          pid: process.pid,
          token,
          acquired_at: new Date().toISOString(),
        } satisfies ReconciliationLockRecord));
      } finally {
        closeSync(fd);
      }
      return () => {
        if (!existsSync(lockPath)) return;
        let current: ReconciliationLockRecord;
        try {
          current = JSON.parse(readFileSync(lockPath, 'utf8')) as ReconciliationLockRecord;
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          throw new Error(`agent_start_result_reconciliation_lock_release_failed: ${lockPath}: ${detail}`);
        }
        if (current.token === token) unlinkSync(lockPath);
      };
    } catch (error) {
      if ((error as { code?: string }).code !== 'EEXIST') {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`agent_start_result_reconciliation_lock_failed: ${lockPath}: ${detail}`);
      }

      let owner: ReconciliationLockRecord | null = null;
      try {
        const parsed = JSON.parse(readFileSync(lockPath, 'utf8')) as Partial<ReconciliationLockRecord>;
        if (Number.isInteger(parsed.pid) && typeof parsed.token === 'string' && typeof parsed.acquired_at === 'string') {
          owner = parsed as ReconciliationLockRecord;
        }
      } catch (readError) {
        if ((readError as { code?: string }).code === 'ENOENT') continue;
      }

      if (!owner) {
        try {
          if (Date.now() - statSync(lockPath).mtimeMs > RECONCILIATION_LOCK_STALE_MS) {
            unlinkSync(lockPath);
            continue;
          }
        } catch (statError) {
          if ((statError as { code?: string }).code === 'ENOENT') continue;
          const detail = statError instanceof Error ? statError.message : String(statError);
          throw new Error(`agent_start_result_reconciliation_lock_invalid: ${lockPath}: ${detail}`);
        }
        if (Date.now() >= deadline) {
          throw new Error(`agent_start_result_reconciliation_busy: ${lockPath}`);
        }
        sleepForReconciliationLock();
        continue;
      }

      if (!isProcessAlive(owner.pid)) {
        try {
          unlinkSync(lockPath);
        } catch (unlinkError) {
          if ((unlinkError as { code?: string }).code !== 'ENOENT') throw unlinkError;
        }
        continue;
      }

      if (Date.now() >= deadline) {
        throw new Error(`agent_start_result_reconciliation_busy: ${lockPath}`);
      }
      sleepForReconciliationLock();
    }
  }
}

export function reconcileLaunchResults(launchResultsDir: string): LaunchResultReconciliationReceipt {
  const reconciliationDir = join(dirname(launchResultsDir), 'agent-start-reconciliation');
  const receiptPath = join(reconciliationDir, 'v1.json');
  const releaseLock = acquireReconciliationLock(join(reconciliationDir, 'v1.lock'));
  try {
    if (existsSync(receiptPath)) {
      let existingReceipt: unknown;
      try {
        existingReceipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
      } catch {
        throw new Error(`agent_start_result_reconciliation_receipt_invalid: ${receiptPath}`);
      }
      if (isCompletedReconciliationReceipt(existingReceipt, launchResultsDir)) return existingReceipt;
      throw new Error(`agent_start_result_reconciliation_receipt_invalid: ${receiptPath}`);
    }

    const startedAt = new Date().toISOString();
    const invalidArtifacts = listInvalidLaunchResults(launchResultsDir);
    const pendingReceipt: LaunchResultReconciliationReceipt = {
      schema: LAUNCH_RESULT_RECONCILIATION_SCHEMA,
      status: 'pending',
      version: 1,
      launch_results_dir: launchResultsDir,
      started_at: startedAt,
      deleted_artifacts: invalidArtifacts,
    };
    const pendingPath = join(reconciliationDir, 'v1.pending.json');
    if (existsSync(pendingPath)) rmSync(pendingPath, { force: true });
    writeJsonAtomically(pendingPath, pendingReceipt);

    const deletedAt = new Date().toISOString();
    for (const artifact of invalidArtifacts) {
      try {
        unlinkSync(artifact.path);
      } catch (error) {
        if ((error as { code?: string }).code !== 'ENOENT') throw error;
      }
      artifact.deleted_at = deletedAt;
    }
    const completedReceipt: LaunchResultReconciliationReceipt = {
      ...pendingReceipt,
      status: 'completed',
      completed_at: new Date().toISOString(),
    };
    writeJsonAtomically(receiptPath, completedReceipt);
    if (existsSync(pendingPath)) rmSync(pendingPath, { force: true });
    return completedReceipt;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (
      detail.startsWith('agent_start_result_reconciliation_receipt_invalid:')
      || detail.startsWith('agent_start_result_reconciliation_busy:')
      || detail.startsWith('agent_start_result_reconciliation_lock_')
      || detail.startsWith('agent_start_result_reconciliation_failed:')
    ) throw error;
    throw new Error(`agent_start_result_reconciliation_failed: ${detail}`);
  } finally {
    releaseLock();
  }
}

export function readLaunchResults(launchResultsDir: string): LaunchResultSummary[] {
  if (!existsSync(launchResultsDir)) return [];
  return readdirSync(launchResultsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.result.json'))
    .map((entry) => readLaunchResult(join(launchResultsDir, entry.name)));
}

export function readJsonFile(path: string): unknown {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function readLaunchResult(path: string): LaunchResultSummary {
    const stats = statSync(path);
    const record: AgentStartResultV0 = parseLaunchResultForDiscovery(readFileSync(path, 'utf8'), path);
    const sessionProjection = resolveAgentStartSessionProjection(record);
    const projectedSessionRef = sessionProjection?.session_ref;
    const sessionRef = projectedSessionRef
      && typeof projectedSessionRef.id === 'string'
      && (projectedSessionRef.kind === 'runtime'
        || projectedSessionRef.kind === 'nars'
        || projectedSessionRef.kind === 'carrier')
      ? { id: projectedSessionRef.id, kind: projectedSessionRef.kind }
      : undefined;
    const carrierSessionRegistration = record.carrier_actions?.carrier_session_registration;
    const runtimeSessionId = sessionProjection?.runtime_session_id ?? undefined;
    const narsSessionId = sessionProjection?.nars_session_id ?? undefined;
    const carrierSessionId = sessionProjection?.carrier_session_id ?? undefined;
    const controlPath = stringValue(
      record.nars_launch?.control_path
        ?? controlPathFromRuntimeArgs(record.runtime_args)
        ?? (carrierSessionId
          ? join(
              siteRootFromLaunchResultPath(path),
              '.narada',
              'crew',
              'nars-sessions',
              carrierSessionId,
              'control.jsonl',
            )
          : undefined),
    );
    const sessionPath = stringValue(record.nars_launch?.session_path);
    const parentPid = numberValue(
      record.carrier_session?.record?.parent_process?.pid
        ?? carrierSessionRegistration?.record?.parent_process?.pid,
    );
    return {
      path,
      mtime_ms: stats.mtimeMs,
      schema: stringValue(record.schema),
      status: stringValue(record.status),
      agent_start_event: stringValue(record.agent_start_event),
      identity: stringValue(record.identity ?? record.required_environment?.NARADA_AGENT_ID),
      agent_identity_ref: objectValue(record.agent_identity_ref),
      operator_surface_kind: stringValue(record.operator_surface_kind ?? record.nars_launch?.operator_surface_kind ?? record.carrier_kind),
      runtime_host_kind: stringValue(record.runtime_host_kind ?? record.nars_launch?.runtime_host_kind ?? record.runtime_substrate_kind ?? record.runtime),
      carrier_kind: stringValue(record.carrier_kind),
      runtime: stringValue(record.runtime),
      runtime_substrate_kind: stringValue(record.runtime_substrate_kind),
      site_root: stringValue(record.required_environment?.NARADA_SITE_ROOT),
      target_site_root: stringValue(record.target_site_root),
      session_site_root: stringValue(record.session_site_root),
      runtime_session_id: runtimeSessionId,
      nars_session_id: narsSessionId,
      carrier_session_id: carrierSessionId,
      session_ref: sessionRef,
      control_path: controlPath,
      control_path_exists: controlPath ? existsSync(controlPath) : false,
      session_path: sessionPath,
      session_path_exists: sessionPath ? existsSync(sessionPath) : false,
      launch_source: stringValue(record.launch_source),
      parent_pid: parentPid,
      parent_process_alive: parentPid ? isProcessAlive(parentPid) : null,
      started_at: stringValue(
        record.started_at
          ?? record.carrier_session?.record?.started_at
          ?? carrierSessionRegistration?.record?.started_at
          ?? record.created_at,
      ),
      expires_at: stringValue(record.expires_at),
    };
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as { code?: string }).code === 'EPERM';
  }
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function controlPathFromRuntimeArgs(args: unknown): string | undefined {
  if (!Array.isArray(args)) return undefined;
  const index = args.findIndex((arg) => String(arg) === '--control-jsonl');
  return index >= 0 ? stringValue(args[index + 1]) : undefined;
}

function siteRootFromLaunchResultPath(path: string): string {
  return dirname(dirname(dirname(dirname(path))));
}

export function tryParseJson(value: string): unknown {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}
