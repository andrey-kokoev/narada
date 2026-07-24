import { join, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';

export interface ResolvedSiteRoot {
  site_root: string;
  source: 'explicit_site_root' | 'user_site_launch_registry' | 'site_registry';
  site_id: string | null;
}

export async function listKnownSiteRootsForCli(options: Pick<SiteRootOptions, 'launchRegistryPath'> = {}): Promise<ResolvedSiteRoot[]> {
  const byRoot = new Map<string, ResolvedSiteRoot>();
  for (const site of listLaunchRegistrySites(options.launchRegistryPath)) {
    if (!byRoot.has(site.site_root.toLowerCase())) byRoot.set(site.site_root.toLowerCase(), site);
  }
  for (const site of await listLocalRegistrySites()) {
    if (!byRoot.has(site.site_root.toLowerCase())) byRoot.set(site.site_root.toLowerCase(), site);
  }
  return Array.from(byRoot.values()).sort((a, b) => String(a.site_id ?? '').localeCompare(String(b.site_id ?? '')));
}

/**
 * Read launch records as a discovery input for an explicit registry refresh.
 *
 * This is deliberately separate from `listKnownSiteRootsForCli`: launch
 * records describe how to start an agent, while the Site Registry is the
 * canonical local catalog used for Site discovery and selection.
 */
export function listLaunchRegistrySites(registryPath = defaultLaunchRegistryPath()): ResolvedSiteRoot[] {
  if (!registryPath || !existsSync(registryPath)) return [];
  const records = parseLaunchRegistry(readFileSync(registryPath, 'utf8'));
  const bySiteRoot = new Map<string, ResolvedSiteRoot>();
  for (const record of records) {
    if (!record.SiteRoot) continue;
    const siteId = inferSiteId(record);
    const resolved = resolve(record.SiteRoot);
    bySiteRoot.set(resolved.toLowerCase(), {
      site_root: resolved,
      source: 'user_site_launch_registry',
      site_id: siteId,
    });
  }
  return Array.from(bySiteRoot.values());
}

async function listLocalRegistrySites(): Promise<ResolvedSiteRoot[]> {
  let registry: { listSites(): Array<{ siteId: string; siteRoot: string }>; close(): void };
  try {
    registry = await openSiteRegistry();
  } catch {
    return [];
  }
  try {
    return registry.listSites().map((site) => ({
      site_root: resolve(site.siteRoot),
      source: 'site_registry' as const,
      site_id: site.siteId,
    }));
  } catch {
    return [];
  } finally {
    registry.close();
  }
}

export function defaultLaunchRegistryPath(): string {
  const userProfileSiteRoot = process.env.USERPROFILE ? `${process.env.USERPROFILE}\\Narada` : null;
  const userSiteRoot = process.env.NARADA_USER_SITE_ROOT ?? userProfileSiteRoot;
  return resolve(userSiteRoot ?? `${homedir()}${process.platform === 'win32' ? '\\Narada' : '/Narada'}`, 'config', 'launch', 'agents.psd1');
}

function parseLaunchRegistry(content: string): Array<Record<string, string>> {
  const records: Array<Record<string, string>> = [];
  let current: Record<string, string> | null = null;
  for (const line of content.split(/\r?\n/)) {
    if (line.trim() === '@{') {
      current = {};
      continue;
    }
    if (current && line.trim() === '}') {
      if (Object.keys(current).length > 0) records.push(current);
      current = null;
      continue;
    }
    if (!current) continue;
    const value = line.match(/^\s*(Agent|Site|Role|NaradaRoot|WorkspaceRoot|SiteRoot|Launcher|Carrier|Runtime)\s*=\s*["']([^"']+)["']/);
    if (value) current[value[1]] = value[2];
  }
  return records;
}

function inferSiteId(record: Record<string, string>): string | null {
  // An explicit Site field in the launch record is an operator-authored
  // declaration and always wins. Without one, the site's own config.json is
  // the canonical identity declaration; directory-name inference is last.
  if (record.Site) return record.Site;
  const configuredSiteId = siteIdFromSiteRoot(record.SiteRoot ?? record.NaradaRoot);
  if (configuredSiteId) return configuredSiteId;
  const root = record.SiteRoot?.replace(/[\\/]+$/, '').split(/[\\/]/).pop() === '.narada'
    ? record.NaradaRoot
    : record.SiteRoot ?? record.NaradaRoot;
  const name = root ? normalizeSiteName(root.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? null) : null;
  if (name) return name;
  if (record.Agent?.includes('.')) return normalizeSiteName(record.Agent.split('.')[0] ?? null);
  return null;
}

function siteIdFromSiteRoot(siteRoot: string | undefined): string | null {
  if (!siteRoot) return null;
  const resolvedRoot = resolve(siteRoot);
  const configPaths = [
    join(resolvedRoot, 'site.json'),
    join(resolvedRoot, '.narada', 'site.json'),
    join(resolvedRoot, 'config.json'),
    join(resolvedRoot, '.narada', 'config.json'),
  ];
  for (const configPath of configPaths) {
    if (!existsSync(configPath)) continue;
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
        site_id?: unknown;
        site?: { site_id?: unknown };
        static_config?: { site_id?: unknown };
      };
      const siteId = typeof config.site_id === 'string'
        ? config.site_id
        : typeof config.site?.site_id === 'string'
          ? config.site.site_id
          : typeof config.static_config?.site_id === 'string'
            ? config.static_config.site_id
            : null;
      if (siteId?.trim()) return siteId.trim();
    } catch {
      // Keep the launch-record identity fallback when a Site config is unreadable.
    }
  }
  return null;
}

function normalizeSiteName(name: string | null): string | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  if (lower === '.narada') return null;
  if (name.startsWith('narada.')) return name.slice('narada.'.length);
  if (name.startsWith('narada-')) return name.slice('narada-'.length);
  return lower;
}

export interface SiteRootOptions {
  siteRoot?: string;
  site?: string;
  launchRegistryPath?: string;
}

export async function resolveSiteRootForCli(options: SiteRootOptions): Promise<ResolvedSiteRoot> {
  if (options.siteRoot) {
    const siteRoot = resolve(options.siteRoot);
    const launchRegistrySite = listLaunchRegistrySites(options.launchRegistryPath)
      .find((candidate) => candidate.site_root.toLowerCase() === siteRoot.toLowerCase());
    const localRegistrySite = launchRegistrySite
      ? null
      : (await listLocalRegistrySites()).find((candidate) => candidate.site_root.toLowerCase() === siteRoot.toLowerCase());
    return {
      site_root: siteRoot,
      source: 'explicit_site_root',
      site_id: siteIdFromSiteRoot(siteRoot) ?? launchRegistrySite?.site_id ?? localRegistrySite?.site_id ?? null,
    };
  }
  if (!options.site) throw new Error('site_required: pass --site <site-id> or --site-root <path>');
  const launchSite = listLaunchRegistrySites(options.launchRegistryPath)
    .find((candidate) => candidate.site_id === options.site);
  if (launchSite) return launchSite;
  const registry = await openSiteRegistry();
  try {
    const site = registry.listSites().find((candidate: { siteId: string }) => candidate.siteId === options.site);
    if (!site) throw new Error(`site_not_found: ${options.site}`);
    return {
      site_root: resolve(site.siteRoot),
      source: 'site_registry',
      site_id: site.siteId,
    };
  } finally {
    registry.close();
  }
}

async function openSiteRegistry(): Promise<{ listSites(): Array<{ siteId: string; siteRoot: string }>; close(): void }> {
  const {
    resolveRegistryDbPathByLocus,
    openRegistryDb,
    SiteRegistry,
  } = await import('@narada2/windows-site');
  const dbPath = resolveRegistryDbPathByLocus({ authorityLocus: 'user', variant: 'native' });
  const db = await openRegistryDb(dbPath);
  return new SiteRegistry(db);
}
