import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { siteAuthorityRootFromSiteRoot } from '@narada2/site-paths';

export interface WorkspaceLaunchUiSessionRecord {
  schema: 'narada.workspace_launch.ui_session.v1';
  ui_session_id: string;
  started_at: string;
  status: 'open' | 'closing' | 'closed' | 'timeout';
  url: string | null;
  registry_paths: string[];
  owner: {
    package: '@narada2/cli';
    command: 'launcher workspace-launch';
    surface: 'interactive-selection-ui';
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

export async function readWorkspaceLaunchUiSessions(): Promise<WorkspaceLaunchUiSessionRecord[]> {
  const root = workspaceLaunchUiSessionPersistenceRoot();
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const sessions = await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map(async (entry) => {
      const session = await readJsonFile(join(root, entry.name, 'session.json'));
      return isWorkspaceLaunchUiSessionRecord(session) ? session : null;
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
    && (value.status === 'open' || value.status === 'closing' || value.status === 'closed' || value.status === 'timeout')
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
