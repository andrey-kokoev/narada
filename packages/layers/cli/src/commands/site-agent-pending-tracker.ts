export interface SiteAgentPendingEntry {
  site_id: string;
  agent_id: string;
  session_id: string | null;
  started_at: string;
}

export interface SiteAgentPendingTracker {
  record(entry: SiteAgentPendingEntry): void;
  list(): SiteAgentPendingEntry[];
  resolve(siteId: string, agentId: string): SiteAgentPendingEntry | null;
  remove(siteId: string, agentId: string): boolean;
}

export const SITE_AGENT_PENDING_TTL_MS = 15 * 60 * 1000;

function keyOf(siteId: string, agentId: string): string {
  return `${siteId.toLowerCase()}/${agentId.toLowerCase()}`;
}

/**
 * In-memory pending-launch record owned by the console server process. It makes
 * a started agent's "starting" state durable across console page reloads while
 * its runtime and session route come up. Entries expire on a TTL; success is
 * reconciled by the session-route endpoint and the overview, not by this store.
 */
export function createSiteAgentPendingTracker(
  options: { ttlMs?: number; now?: () => Date } = {},
): SiteAgentPendingTracker {
  const ttlMs = options.ttlMs ?? SITE_AGENT_PENDING_TTL_MS;
  const now = options.now ?? (() => new Date());
  const entries = new Map<string, SiteAgentPendingEntry & { expiresAt: number }>();

  function prune(): void {
    const current = now().getTime();
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= current) entries.delete(key);
    }
  }

  function toEntry(entry: SiteAgentPendingEntry & { expiresAt: number }): SiteAgentPendingEntry {
    return {
      site_id: entry.site_id,
      agent_id: entry.agent_id,
      session_id: entry.session_id,
      started_at: entry.started_at,
    };
  }

  return {
    record(entry) {
      prune();
      entries.set(keyOf(entry.site_id, entry.agent_id), { ...entry, expiresAt: now().getTime() + ttlMs });
    },
    list() {
      prune();
      return Array.from(entries.values(), toEntry);
    },
    resolve(siteId, agentId) {
      prune();
      const entry = entries.get(keyOf(siteId, agentId));
      return entry ? toEntry(entry) : null;
    },
    remove(siteId, agentId) {
      return entries.delete(keyOf(siteId, agentId));
    },
  };
}
