import { computed, type Ref } from 'vue';
import { unwrapRuntimeEvent } from '../../runtime-events.ts';

export interface GitSummary {
  status: string;
  serverName: string | null;
  repository: Record<string, unknown> | null;
  counts: Record<string, unknown>;
  changedFiles: GitCollection;
  recentCommits: GitCollection;
  errors: GitSummaryError[];
  source: 'event' | 'none';
}

export interface GitCollection {
  items: Record<string, unknown>[];
  count: number;
  truncated?: boolean;
}

export interface GitSummaryError {
  code?: string;
  tool?: string;
  message?: string;
}

export function useGitSummary(events: Ref<unknown[]> | unknown[]) {
  const summary = computed<GitSummary>(() => {
    const retainedEvents = Array.isArray(events) ? events : events.value;
    for (let index = retainedEvents.length - 1; index >= 0; index -= 1) {
      const event = unwrapRuntimeEvent(retainedEvents[index]);
      if (!event || typeof event !== 'object') continue;
      const record = event as Record<string, unknown>;
      if (record.event !== 'session_git_summary') continue;
      return normalizeGitSummary(record);
    }
    return emptySummary();
  });
  return { summary };
}

function normalizeGitSummary(record: Record<string, unknown>): GitSummary {
  return {
    status: stringField(record, 'status') ?? 'unknown',
    serverName: stringField(record, 'server_name') ?? stringField(record, 'serverName'),
    repository: objectField(record.repository),
    counts: objectField(record.counts) ?? {},
    changedFiles: normalizeCollection(record.changed_files),
    recentCommits: normalizeCollection(record.recent_commits),
    errors: arrayField(record.errors).map(normalizeError).filter(Boolean) as GitSummaryError[],
    source: 'event',
  };
}

function normalizeCollection(value: unknown): GitCollection {
  const record = objectField(value);
  const items = arrayField(record?.items).filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)));
  const count = numberField(record, 'count') ?? items.length;
  return { items, count, truncated: Boolean(record?.truncated) };
}

function normalizeError(value: unknown): GitSummaryError | null {
  const record = objectField(value);
  if (!record) return null;
  return { code: stringField(record, 'code') ?? undefined, tool: stringField(record, 'tool') ?? undefined, message: stringField(record, 'message') ?? undefined };
}

function emptySummary(): GitSummary {
  return {
    status: 'not_loaded',
    serverName: null,
    repository: null,
    counts: {},
    changedFiles: { items: [], count: 0, truncated: false },
    recentCommits: { items: [], count: 0 },
    errors: [],
    source: 'none',
  };
}

function objectField(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function arrayField(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringField(record: unknown, field: string): string | null {
  if (!record || typeof record !== 'object') return null;
  const value = (record as Record<string, unknown>)[field];
  return typeof value === 'string' && value ? value : null;
}

function numberField(record: unknown, field: string): number | null {
  if (!record || typeof record !== 'object') return null;
  const value = (record as Record<string, unknown>)[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
