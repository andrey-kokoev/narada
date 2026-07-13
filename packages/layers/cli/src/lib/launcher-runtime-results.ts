import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { LaunchResultRecord, LaunchResultSummary } from './launcher-contracts.js';

export function readLaunchResults(launchResultsDir: string): LaunchResultSummary[] {
  if (!existsSync(launchResultsDir)) return [];
  return readdirSync(launchResultsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.result.json'))
    .map((entry) => readLaunchResult(join(launchResultsDir, entry.name)))
    .filter((summary): summary is LaunchResultSummary => Boolean(summary));
}

export function readJsonFile(path: string): unknown {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function readLaunchResult(path: string): LaunchResultSummary | null {
  try {
    const stats = statSync(path);
    const record = JSON.parse(readFileSync(path, 'utf8')) as LaunchResultRecord;
    const carrierSessionRegistration = record.carrier_actions?.carrier_session_registration;
    const runtimeSessionId = stringValue(
      record.nars_launch?.runtime_session_id
        ?? record.nars_launch?.session_id
        ?? record.required_environment?.NARADA_RUNTIME_SESSION_ID,
    );
    const narsSessionId = stringValue(
      record.nars_launch?.nars_session_id
        ?? record.nars_launch?.session_id
        ?? record.required_environment?.NARADA_NARS_SESSION_ID,
    );
    const carrierSessionId = stringValue(
      record.carrier_session?.carrier_session_id
        ?? carrierSessionRegistration?.carrier_session_id
        ?? record.required_environment?.NARADA_CARRIER_SESSION_ID,
    );
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
  } catch {
    return null;
  }
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
