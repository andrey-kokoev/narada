export interface SiteAgentPendingEntry {
  site_id: string;
  agent_id: string;
  session_id: string | null;
  started_at: string;
  updated_at: string;
  phase: 'launch_accepted' | 'waiting_for_session' | 'waiting_for_route';
}

export interface SiteAgentPendingTracker {
  record(entry: SiteAgentPendingEntry): void;
  update(siteId: string, agentId: string, patch: Pick<SiteAgentPendingEntry, 'phase' | 'updated_at'>): SiteAgentPendingEntry | null;
  list(): SiteAgentPendingEntry[];
  resolve(siteId: string, agentId: string): SiteAgentPendingEntry | null;
  remove(siteId: string, agentId: string): boolean;
}

export const SITE_AGENT_PENDING_TTL_MS = 15 * 60 * 1000;

function keyOf(siteId: string, agentId: string): string {
  return `${siteId.toLowerCase()}/${agentId.toLowerCase()}`;
}

/**
 * Server-owned pending-launch record. It makes a started agent's "starting"
 * state durable across console page reloads and component unmounts while
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
      updated_at: entry.updated_at,
      phase: entry.phase,
    };
  }

  return {
    record(entry) {
      prune();
      entries.set(keyOf(entry.site_id, entry.agent_id), { ...entry, expiresAt: now().getTime() + ttlMs });
    },
    update(siteId, agentId, patch) {
      prune();
      const key = keyOf(siteId, agentId);
      const entry = entries.get(key);
      if (!entry) return null;
      const updated = { ...entry, ...patch };
      entries.set(key, updated);
      return toEntry(updated);
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
