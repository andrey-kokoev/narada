import type { RegistrySiteRecord } from '@narada2/site-registry-contract';
import { OPERATOR_CONSOLE_REGISTRY_PATH } from '@narada2/operator-console-contract';

export type SiteProjectionTone = 'positive' | 'neutral' | 'warning' | 'danger';

export type SiteActionId = 'open' | 'edit' | 'retire' | 'restore' | 'purge';

export interface SiteActionProjection {
  id: SiteActionId;
  label: string;
  href: string | null;
  available: boolean;
}

export interface SiteListProjection {
  siteId: string;
  label: string;
  root: string;
  variant: string;
  lifecycle: string;
  observation: string;
  statusTone: SiteProjectionTone;
  lastSeen: string;
  revision: number;
  aliasCount: number;
  primaryAction: SiteActionProjection;
}

export interface SiteTileProjection extends SiteListProjection {
  summary: string;
  sourceKinds: string[];
  sourceCount: number;
}

export interface SiteDetailProjection {
  siteId: string;
  label: string;
  root: string;
  variant: string;
  substrate: string;
  lifecycle: string;
  observation: string;
  statusTone: SiteProjectionTone;
  createdAt: string;
  updatedAt: string;
  lastSeen: string;
  revision: string;
  aim: string;
  controlEndpoint: string;
  aliases: Array<{ value: string; source: string }>;
  sources: Array<{ kind: string; ref: string; observedAt: string }>;
  actions: SiteActionProjection[];
}

export interface SiteProjectionPaths {
  registryPath?: string;
}

function displayTimestamp(value: string | null, now: number): string {
  if (!value) return 'Never observed';
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return 'Unknown';
  const age = Math.max(0, now - timestamp);
  const minutes = Math.floor(age / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function displayDate(value: string | null): string {
  if (!value) return 'Not recorded';
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return 'Unknown';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp);
}

function statusTone(site: RegistrySiteRecord): SiteProjectionTone {
  if (site.lifecycleStatus === 'retired') return 'warning';
  switch (site.observationStatus) {
    case 'present': return 'positive';
    case 'stale': return 'warning';
    case 'missing':
    case 'conflicted': return 'danger';
    default: return 'neutral';
  }
}

function action(id: SiteActionId, site: RegistrySiteRecord, paths: SiteProjectionPaths): SiteActionProjection {
  const registryPath = paths.registryPath ?? OPERATOR_CONSOLE_REGISTRY_PATH;
  const href = id === 'open' ? `${registryPath}?site=${encodeURIComponent(site.siteId)}` : null;
  const available = id === 'open'
    || (id === 'edit' && site.lifecycleStatus === 'active')
    || (id === 'retire' && site.lifecycleStatus === 'active')
    || (id === 'restore' && site.lifecycleStatus === 'retired')
    || (id === 'purge' && site.lifecycleStatus === 'retired');
  const labels: Record<SiteActionId, string> = {
    open: 'Open',
    edit: 'Edit',
    retire: 'Retire',
    restore: 'Restore',
    purge: 'Purge',
  };
  return { id, label: labels[id], href, available };
}

export function toSiteListProjection(site: RegistrySiteRecord, now = Date.now(), paths: SiteProjectionPaths = {}): SiteListProjection {
  return {
    siteId: site.siteId,
    label: site.siteId,
    root: site.siteRoot,
    variant: site.variant,
    lifecycle: site.lifecycleStatus === 'retired' ? 'Retired' : 'Active',
    observation: site.observationStatus,
    statusTone: statusTone(site),
    lastSeen: displayTimestamp(site.lastSeenAt, now),
    revision: site.revision,
    aliasCount: site.aliases.length,
    primaryAction: action('open', site, paths),
  };
}

export function toSiteTileProjection(site: RegistrySiteRecord, now = Date.now(), paths: SiteProjectionPaths = {}): SiteTileProjection {
  const list = toSiteListProjection(site, now, paths);
  const sourceKinds = [...new Set(site.sources.map((source) => source.kind))];
  return {
    ...list,
    summary: `${list.lifecycle} Site on ${site.variant}; ${list.observation} observation`,
    sourceKinds,
    sourceCount: site.sources.length,
  };
}

export function toSiteDetailProjection(site: RegistrySiteRecord, now = Date.now(), paths: SiteProjectionPaths = {}): SiteDetailProjection {
  return {
    ...toSiteListProjection(site, now, paths),
    substrate: site.substrate,
    createdAt: displayDate(site.createdAt),
    updatedAt: displayDate(site.updatedAt),
    lastSeen: displayTimestamp(site.lastSeenAt, now),
    revision: `Revision ${site.revision}`,
    aim: site.aimJson ?? 'No aim recorded',
    controlEndpoint: site.controlEndpoint ?? 'No control endpoint',
    aliases: site.aliases.map((alias) => ({ value: alias.value, source: alias.source })),
    sources: site.sources.map((source) => ({
      kind: source.kind,
      ref: source.ref,
      observedAt: displayDate(source.observedAt),
    })),
    actions: [action('edit', site, paths), action('retire', site, paths), action('restore', site, paths), action('purge', site, paths)],
  };
}
