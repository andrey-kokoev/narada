import { computed } from 'vue';
import { unwrapRuntimeEvent } from '../../runtime-events.js';

export interface SurfaceAffordanceItem {
  surfaceKind: string;
  surfaceId: string | null;
  serverName: string | null;
  renderer: string | null;
  title: string;
  panel: Record<string, unknown> | null;
  raw: Record<string, unknown>;
}

export interface SurfaceAffordanceSummary {
  schema: 'narada.agent_web_ui.surface_affordances.v1';
  status: 'not_loaded' | 'loaded';
  count: number;
  items: SurfaceAffordanceItem[];
}

export function useSurfaceAffordances(events: unknown[], healthBody?: { value: Record<string, unknown> | null }) {
  const summary = computed<SurfaceAffordanceSummary>(() => {
    const fromHealth = normalizeProjection(objectField(healthBody?.value, 'surface_affordances'));
    const latest = latestSurfaceAffordanceEvent(events);
    const projection = latest ?? fromHealth;
    return {
      schema: 'narada.agent_web_ui.surface_affordances.v1',
      status: projection ? 'loaded' : 'not_loaded',
      count: projection?.items.length ?? 0,
      items: projection?.items ?? [],
    };
  });
  return { summary };
}

function latestSurfaceAffordanceEvent(events: unknown[]): { items: SurfaceAffordanceItem[] } | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = unwrapRuntimeEvent(events[index]);
    if (!event || typeof event !== 'object') continue;
    if ((event as Record<string, unknown>).event !== 'session_surface_affordances') continue;
    const normalized = normalizeProjection(event as Record<string, unknown>);
    if (normalized) return normalized;
  }
  return null;
}

function normalizeProjection(record: Record<string, unknown> | null): { items: SurfaceAffordanceItem[] } | null {
  if (!record) return null;
  const items = arrayField(record, 'items')
    .map(normalizeItem)
    .filter((item): item is SurfaceAffordanceItem => Boolean(item));
  return { items };
}

function normalizeItem(record: Record<string, unknown>): SurfaceAffordanceItem | null {
  const surfaceKind = stringField(record, 'surface_kind');
  if (!surfaceKind) return null;
  return {
    surfaceKind,
    surfaceId: stringField(record, 'surface_id'),
    serverName: stringField(record, 'server_name'),
    renderer: stringField(record, 'renderer'),
    title: stringField(record, 'title') ?? surfaceKind.toUpperCase(),
    panel: objectField(record, 'panel'),
    raw: record,
  };
}

function objectField(record: unknown, field: string): Record<string, unknown> | null {
  if (!record || typeof record !== 'object') return null;
  const value = (record as Record<string, unknown>)[field];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function arrayField(record: Record<string, unknown>, field: string): Record<string, unknown>[] {
  const value = record[field];
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item))) : [];
}

function stringField(record: Record<string, unknown>, field: string): string | null {
  const value = record[field];
  return typeof value === 'string' && value ? value : null;
}
