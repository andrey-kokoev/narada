/**
 * Console Core — shared logic for CLI commands and HTTP server.
 *
 * Contains adapter selection, registry opening, observation factory,
 * and control client factory used by both `narada console` CLI surfaces
 * and the Operator Console HTTP API.
 */

import type {
  ConsoleSiteAdapter,
  RegisteredSite,
  SiteObservationApi,
  SiteControlClientFactory,
} from '@narada2/windows-site';
import { windowsSiteAdapter } from '@narada2/windows-site';
import { cloudflareSiteAdapter } from '@narada2/cloudflare-site';
import { linuxSiteAdapter } from '@narada2/linux-site';

export const ADAPTERS: ConsoleSiteAdapter[] = [windowsSiteAdapter, cloudflareSiteAdapter, linuxSiteAdapter];

export function selectAdapter(site: RegisteredSite): ConsoleSiteAdapter | undefined {
  return ADAPTERS.find((a) => a.supports(site));
}

export function unsupportedObservationApi(site: RegisteredSite): SiteObservationApi {
  return {
    getHealth() {
      return Promise.resolve({
        site_id: site.siteId,
        status: 'error' as const,
        last_cycle_at: null,
        last_cycle_duration_ms: null,
        consecutive_failures: 0,
        message: `Unsupported substrate: ${site.variant}`,
        updated_at: new Date().toISOString(),
      });
    },
    getStuckWorkItems() {
      return Promise.resolve([]);
    },
    getPendingOutboundCommands() {
      return Promise.resolve([]);
    },
    getPendingDrafts() {
      return Promise.resolve([]);
    },
    getCredentialRequirements() {
      return Promise.resolve([]);
    },
  };
}

export async function openRegistry() {
  const {
    resolveRegistryDbPath,
    openRegistryDb,
    SiteRegistry,
  } = await import('@narada2/windows-site');
  const dbPath = resolveRegistryDbPath();
  const db = await openRegistryDb(dbPath);
  return new SiteRegistry(db);
}

export function createObservationFactory() {
  return (site: RegisteredSite) => {
    const adapter = selectAdapter(site);
    if (!adapter) {
      return unsupportedObservationApi(site);
    }
    return adapter.createObservationApi(site);
  };
}

export function createControlClientFactory(
  registry: Awaited<ReturnType<typeof openRegistry>>,
): SiteControlClientFactory {
  return (siteId: string) => {
    const site = registry.getSite(siteId);
    if (!site) return undefined;
    const adapter = selectAdapter(site);
    return adapter?.createControlClient(site);
  };
}
