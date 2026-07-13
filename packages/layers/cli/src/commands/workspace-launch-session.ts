import { dirname, join, resolve } from 'node:path';
import {
  type NarsSessionObservation,
  type NarsSessionProcessOwnership,
} from '@narada2/nars-session-core/session-index';
import type { WorkspaceLaunchObservationRecord, WorkspaceLaunchRecord } from './workspace-launch-types.js';
import type { WorkspaceLaunchSelection as WorkspaceLaunchBrowserSelection } from '@narada2/workspace-launch-contract';
import * as support from './workspace-launch-support.js';
import { selectLaunchRecords } from './workspace-launch-registry.js';

export function workspaceLaunchString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function workspaceLaunchInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

export function workspaceLaunchSiteRootsForSelection(selection: WorkspaceLaunchBrowserSelection, records: WorkspaceLaunchRecord[]): string[] {
  const selected = selectLaunchRecords(records, { all: true, site: selection.site, role: selection.role });
  return support.unique(selected.map((record) => resolve(record.site_root)));
}

export function workspaceLaunchSessionMatchesSelection(session: NarsSessionObservation, selection: WorkspaceLaunchBrowserSelection): boolean {
  const roles = new Set(selection.role.map((role) => role.toLowerCase()));
  const sites = new Set(selection.site.map((site) => normalizeWorkspaceLaunchSiteToken(site)));
  const agentId = workspaceLaunchString(session.agent_id);
  const role = agentId ? agentId.split('.').filter(Boolean).at(-1)?.toLowerCase() : null;
  const siteId = workspaceLaunchString(session.site_id) ?? (agentId ? agentId.split('.')[0] : null);
  if (roles.size > 0 && role && !roles.has(role)) return false;
  if (sites.size > 0 && siteId && !sites.has(normalizeWorkspaceLaunchSiteToken(siteId))) return false;
  return true;
}

export function workspaceLaunchSessionLaunchSessionId(session: NarsSessionObservation): string | null {
  const record = session.record;
  const ownership = session.process_ownership ?? record?.process_ownership ?? null;
  return workspaceLaunchString(session.launch_session_id)
    ?? workspaceLaunchString(record?.launch_session_id)
    ?? workspaceLaunchString(ownership?.launch_session_id);
}

export function workspaceLaunchSessionOwnership(session: NarsSessionObservation): NarsSessionProcessOwnership | null {
  return session.process_ownership ?? session.record?.process_ownership ?? null;
}

export function workspaceLaunchSessionOwnedCleanupAllowed(session: NarsSessionObservation): boolean {
  const ownership = workspaceLaunchSessionOwnership(session);
  return Boolean(ownership && ownership.ownership === 'session_owned' && ownership.cleanup_policy === 'terminate_with_launch_session');
}

export function workspaceLaunchSessionIsTerminalForCleanup(session: NarsSessionObservation): boolean {
  const displayState = workspaceLaunchString(session.display_state);
  const terminalState = workspaceLaunchString(session.terminal_state);
  return terminalState === 'closed' || displayState === 'closed';
}

export function workspaceLaunchControlPathFromSession(session: NarsSessionObservation): string | null {
  const record = session.record;
  const directControlPath = workspaceLaunchString(session.control_path) ?? workspaceLaunchString(record?.control_path);
  if (directControlPath) return directControlPath;
  const sessionPath = workspaceLaunchString(session.session_path) ?? workspaceLaunchString(record?.session_path);
  return sessionPath ? join(dirname(sessionPath), 'control.jsonl') : null;
}

export function workspaceLaunchObservationProcessOwnership(
  session: NarsSessionObservation,
): WorkspaceLaunchObservationRecord['process_ownership'] {
  return workspaceLaunchSessionOwnership(session);
}

export function normalizeWorkspaceLaunchSiteToken(value: string): string {
  return value.toLowerCase().replace(/^narada[-.]/, '').replace(/^narada/, '').replace(/^[-.]/, '');
}
