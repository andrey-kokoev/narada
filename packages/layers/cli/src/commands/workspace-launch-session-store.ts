import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { siteAuthorityRootFromSiteRoot } from '@narada2/site-paths';
import { OPERATOR_CONSOLE_LAUNCH_SESSIONS_PATH } from '@narada2/operator-console-contract';
import {
  workspaceLaunchUiSessionLifecycleFromStatus,
  type WorkspaceLaunchUiSessionLifecycleState,
} from './workspace-launch-lifecycle.js';

export interface WorkspaceLaunchUiSessionRecord {
  schema: 'narada.workspace_launch.ui_session.v1';
  ui_session_id: string;
  started_at: string;
  status: 'open' | 'closing' | 'closed' | 'timeout' | 'failed';
  lifecycle_schema?: 'narada.workspace_launch.ui_session.lifecycle_state.v1';
  lifecycle_state?: WorkspaceLaunchUiSessionLifecycleState;
  lifecycle_history?: WorkspaceLaunchUiSessionLifecycleState[];
  url: string | null;
  registry_paths: string[];
  owner: {
    package: '@narada2/cli';
    command: 'launcher workspace-launch';
    surface: 'interactive-selection-ui';
  };
}

export function isWorkspaceLaunchUiSessionActive(session: Pick<WorkspaceLaunchUiSessionRecord, 'status'>): boolean {
  return session.status === 'open' || session.status === 'closing';
}

export function normalizeWorkspaceLaunchUiSessionRecord(value: unknown): WorkspaceLaunchUiSessionRecord | null {
  if (!isWorkspaceLaunchUiSessionRecord(value)) return null;
  const lifecycle = isWorkspaceLaunchUiSessionLifecycleState(value.lifecycle_state)
    && value.lifecycle_schema === 'narada.workspace_launch.ui_session.lifecycle_state.v1'
    && isWorkspaceLaunchUiSessionLifecycleHistory(value.lifecycle_history)
    ? {
      schema: value.lifecycle_schema,
      state: value.lifecycle_state,
      history: value.lifecycle_history,
    }
    : workspaceLaunchUiSessionLifecycleFromStatus(value.status);
  return {
    ...value,
    lifecycle_schema: lifecycle.schema,
    lifecycle_state: lifecycle.state,
    lifecycle_history: lifecycle.history,
  };
}

export function workspaceLaunchUserSiteRoot(): string {
  return process.env.NARADA_USER_SITE_ROOT
    ?? (process.env.USERPROFILE ? join(process.env.USERPROFILE, 'Narada') : null)
    ?? join(process.cwd(), '.andrey-user');
}

export function workspaceLaunchUiSessionPersistenceRoot(): string {
  return join(siteAuthorityRootFromSiteRoot(workspaceLaunchUserSiteRoot()), 'runtime', 'workspace-launch-ui-sessions');
}

export function workspaceLaunchUiSessionRoute(uiSessionId: string): string {
  return `${OPERATOR_CONSOLE_LAUNCH_SESSIONS_PATH}/${encodeURIComponent(uiSessionId)}`;
}

export function isWorkspaceLaunchUiSessionProxyable(session: WorkspaceLaunchUiSessionRecord): boolean {
  if (!isWorkspaceLaunchUiSessionActive(session) || !session.url) return false;
  try {
    const target = new URL(session.url);
    return (target.protocol === 'http:' || target.protocol === 'https:')
      && (target.hostname === '127.0.0.1'
        || target.hostname === '::1'
        || target.hostname === '[::1]');
  } catch {
    return false;
  }
}

export async function readWorkspaceLaunchUiSessions(): Promise<WorkspaceLaunchUiSessionRecord[]> {
  const root = workspaceLaunchUiSessionPersistenceRoot();
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const sessions = await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map(async (entry) => {
      const session = await readJsonFile(join(root, entry.name, 'session.json'));
      return normalizeWorkspaceLaunchUiSessionRecord(session);
    }));
  return sessions
    .filter((session): session is WorkspaceLaunchUiSessionRecord => session !== null)
    .sort((left, right) => right.started_at.localeCompare(left.started_at));
}

export function isWorkspaceLaunchUiSessionRecord(value: unknown): value is WorkspaceLaunchUiSessionRecord {
  if (!isRecord(value)) return false;
  const owner = value.owner;
  return value.schema === 'narada.workspace_launch.ui_session.v1'
    && isString(value.ui_session_id)
    && isString(value.started_at)
    && (value.status === 'open' || value.status === 'closing' || value.status === 'closed' || value.status === 'timeout' || value.status === 'failed')
    && (value.url === null || isString(value.url))
    && isStringArray(value.registry_paths)
    && isRecord(owner)
    && owner.package === '@narada2/cli'
    && owner.command === 'launcher workspace-launch'
    && owner.surface === 'interactive-selection-ui';
}

async function readJsonFile(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isWorkspaceLaunchUiSessionLifecycleState(value: unknown): value is WorkspaceLaunchUiSessionLifecycleState {
  return value === 'created'
    || value === 'starting'
    || value === 'open'
    || value === 'closing'
    || value === 'closed'
    || value === 'timeout'
    || value === 'failed';
}

function isWorkspaceLaunchUiSessionLifecycleHistory(value: unknown): value is WorkspaceLaunchUiSessionLifecycleState[] {
  return Array.isArray(value) && value.length > 0 && value.every(isWorkspaceLaunchUiSessionLifecycleState);
}
