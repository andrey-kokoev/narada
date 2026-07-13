import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { siteAuthorityRootFromSiteRoot } from '@narada2/site-paths';
import { normalizeWorkspaceLaunchBrowserSelection } from './workspace-launch-selection.js';
import type {
  WorkspaceLaunchAttemptRecord,
  WorkspaceLaunchProjectionObservationRecord,
} from './launcher.js';
import type { WorkspaceLaunchSelection as WorkspaceLaunchBrowserSelection } from '@narada2/workspace-launch-contract';
import {
  isWorkspaceLaunchUiSessionRecord,
  workspaceLaunchUiSessionPersistenceRoot,
  workspaceLaunchUserSiteRoot,
  type WorkspaceLaunchUiSessionRecord,
} from './workspace-launch-session-store.js';

interface WorkspaceLaunchRememberedSelectionRecord {
  schema: 'narada.workspace_launch.remembered_selection.v1';
  updated_at: string;
  selection: WorkspaceLaunchBrowserSelection;
}

export interface WorkspaceLaunchAttemptStoreContext {
  expectedLaunchSessionIds: (diagnostic: unknown) => string[];
}

export function workspaceLaunchRememberedSelectionRoot(): string {
  return join(siteAuthorityRootFromSiteRoot(workspaceLaunchUserSiteRoot()), 'runtime', 'workspace-launch-ui-state');
}

function workspaceLaunchRememberedSelectionPath(): string {
  return join(workspaceLaunchRememberedSelectionRoot(), 'remembered-selection.json');
}

export async function readWorkspaceLaunchRememberedSelection(): Promise<WorkspaceLaunchBrowserSelection | null> {
  const parsed = await readJsonFile(workspaceLaunchRememberedSelectionPath());
  return normalizeWorkspaceLaunchRememberedSelectionRecord(parsed)?.selection ?? null;
}

export async function writeWorkspaceLaunchRememberedSelection(selection: WorkspaceLaunchBrowserSelection): Promise<void> {
  const path = workspaceLaunchRememberedSelectionPath();
  await mkdir(dirname(path), { recursive: true });
  const normalizedSelection = normalizeWorkspaceLaunchBrowserSelection(selection);
  await writeJsonFile(path, {
    schema: 'narada.workspace_launch.remembered_selection.v1',
    updated_at: new Date().toISOString(),
    selection: normalizedSelection,
  } satisfies WorkspaceLaunchRememberedSelectionRecord);
}

function normalizeWorkspaceLaunchRememberedSelectionRecord(value: unknown): WorkspaceLaunchRememberedSelectionRecord | null {
  if (!isRecord(value)) return null;
  const rawSelection = isRecord(value.selection) ? value.selection : value;
  try {
    const selection = normalizeWorkspaceLaunchBrowserSelection(rawSelection as Partial<WorkspaceLaunchBrowserSelection>);
    return {
      schema: 'narada.workspace_launch.remembered_selection.v1',
      updated_at: typeof value.updated_at === 'string' && value.updated_at ? value.updated_at : new Date(0).toISOString(),
      selection,
    };
  } catch {
    return null;
  }
}

export function workspaceLaunchUiSessionPersistenceDir(uiSessionId: string): string {
  return join(workspaceLaunchUiSessionPersistenceRoot(), uiSessionId);
}

export async function persistWorkspaceLaunchDashboardState(
  dir: string,
  uiSession: WorkspaceLaunchUiSessionRecord,
  attempts: WorkspaceLaunchAttemptRecord[],
): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeJsonFile(join(dir, 'session.json'), uiSession);
  await writeJsonLinesFile(join(dir, 'attempts.jsonl'), attempts);
  await writeJsonLinesFile(join(dir, 'handoffs.jsonl'), attempts.flatMap((attempt) => attempt.handoffs));
  await writeJsonLinesFile(join(dir, 'observations.jsonl'), attempts.flatMap((attempt) => attempt.observations));
  await writeJsonLinesFile(join(dir, 'projections.jsonl'), attempts.flatMap((attempt) => attempt.projections));
  await pruneWorkspaceLaunchDashboardSessions(workspaceLaunchUiSessionPersistenceRoot());
}

export async function loadRecoveredWorkspaceLaunchAttempts(
  registryPaths: string[],
  context: WorkspaceLaunchAttemptStoreContext,
): Promise<WorkspaceLaunchAttemptRecord[]> {
  const root = workspaceLaunchUiSessionPersistenceRoot();
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const sessions = await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map(async (entry) => {
      const dir = join(root, entry.name);
      const session = await readJsonFile(join(dir, 'session.json'));
      if (!isWorkspaceLaunchUiSessionRecord(session)) return null;
      if (!workspaceLaunchRegistryPathsCompatible(registryPaths, session.registry_paths)) return null;
      const attempts = (await readJsonLinesFile(join(dir, 'attempts.jsonl')))
        .map((value) => normalizeWorkspaceLaunchAttemptRecord(value, context))
        .filter((attempt): attempt is WorkspaceLaunchAttemptRecord => attempt !== null);
      return { session, attempts };
    }));
  const compatible = sessions.filter((session): session is { session: WorkspaceLaunchUiSessionRecord; attempts: WorkspaceLaunchAttemptRecord[] } => session !== null);
  compatible.sort((a, b) => b.session.started_at.localeCompare(a.session.started_at));
  return compatible[0]?.attempts ?? [];
}

export function normalizeWorkspaceLaunchAttemptRecord(
  value: unknown,
  context: WorkspaceLaunchAttemptStoreContext,
): WorkspaceLaunchAttemptRecord | null {
  if (!isWorkspaceLaunchAttemptRecord(value)) return null;
  return {
    ...value,
    expected_launch_session_ids: Array.isArray(value.expected_launch_session_ids)
      ? value.expected_launch_session_ids.map(workspaceLaunchString).filter((entry): entry is string => Boolean(entry))
      : context.expectedLaunchSessionIds(value.diagnostic),
    projections: Array.isArray(value.projections) ? value.projections.filter(isWorkspaceLaunchProjectionObservationRecord) : [],
  };
}

async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeJsonLinesFile(path: string, values: unknown[]): Promise<void> {
  await writeFile(path, values.map((value) => JSON.stringify(value)).join('\n') + (values.length > 0 ? '\n' : ''), 'utf8');
}

async function readJsonFile(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

async function readJsonLinesFile(path: string): Promise<unknown[]> {
  try {
    return (await readFile(path, 'utf8'))
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function workspaceLaunchRegistryPathsCompatible(current: string[], saved: string[]): boolean {
  const normalize = (value: string) => resolve(value).toLowerCase();
  const currentSet = new Set(current.map(normalize));
  const savedSet = new Set(saved.map(normalize));
  if (currentSet.size !== savedSet.size) return false;
  return [...currentSet].every((value) => savedSet.has(value));
}

async function pruneWorkspaceLaunchDashboardSessions(root: string): Promise<void> {
  const keep = workspaceLaunchDashboardRetentionCount();
  if (keep <= 0 || !existsSync(root)) return;
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const sessions = await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map(async (entry) => {
      const dir = join(root, entry.name);
      const session = await readJsonFile(join(dir, 'session.json'));
      return isWorkspaceLaunchUiSessionRecord(session) ? { dir, started_at: session.started_at } : null;
    }));
  const ordered = sessions
    .filter((session): session is { dir: string; started_at: string } => session !== null)
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
  await Promise.all(ordered.slice(keep).map((session) => rm(session.dir, { recursive: true, force: true })));
}

function workspaceLaunchDashboardRetentionCount(): number {
  const raw = process.env.NARADA_WORKSPACE_LAUNCH_UI_SESSION_RETENTION;
  if (!raw) return 20;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
}

function isWorkspaceLaunchAttemptRecord(value: unknown): value is WorkspaceLaunchAttemptRecord {
  return isRecord(value)
    && value.schema === 'narada.workspace_launch.attempt.v1'
    && typeof value.launch_attempt_id === 'string'
    && isRecord(value.selection)
    && Array.isArray(value.handoffs)
    && Array.isArray(value.observations)
    && Array.isArray(value.actions);
}

function isWorkspaceLaunchProjectionObservationRecord(value: unknown): value is WorkspaceLaunchProjectionObservationRecord {
  return isRecord(value)
    && value.schema === 'narada.workspace_launch.observed_projection.v1'
    && typeof value.observation_id === 'string'
    && typeof value.launch_attempt_id === 'string'
    && (value.projection_kind === 'agent-web-ui' || value.projection_kind === 'agent-cli')
    && (value.status === 'planned' || value.status === 'handed_off' || value.status === 'failed');
}

function workspaceLaunchString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
