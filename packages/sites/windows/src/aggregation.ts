/**
 * Cross-Site Health Aggregation & Attention Queue Derivation.
 *
 * Read-only aggregator that queries each Site's observation API,
 * computes health summaries, and derives an attention queue.
 *
 * Non-goals (per Task 381):
 * - Does not mutate Site state.
 * - Does not implement the control router (Task 382).
 * - Does not implement the CLI surface (Task 383).
 */

import type { SiteRegistry, RegisteredSite } from "./registry.js";
import type { SiteObservationApi } from "./site-observation.js";
import type { SiteHealthRecord } from "./types.js";

// ---------------------------------------------------------------------------
// Health Aggregation
// ---------------------------------------------------------------------------

export interface CrossSiteHealthSummary {
  total_sites: number;
  healthy: number;
  degraded: number;
  critical: number;
  auth_failed: number;
  stale: number;
  error: number;
  stopped: number;
  /** Per-site health view with last cycle time and consecutive failures. */
  sites: SiteHealthView[];
}

export interface SiteHealthView {
  site_id: string;
  variant: RegisteredSite["variant"];
  status: SiteHealthRecord["status"];
  last_cycle_at: string | null;
  last_cycle_duration_ms: number | null;
  consecutive_failures: number;
  message: string;
  updated_at: string;
}

/**
 * Aggregate health across all registered Sites.
 *
 * Queries each Site's observation API and produces a cross-site summary.
 * Never mutates Site state.
 */
export async function aggregateHealth(
  registry: SiteRegistry,
  observationFactory: (site: RegisteredSite) => SiteObservationApi,
): Promise<CrossSiteHealthSummary> {
  const sites = registry.listSites();
  const summary: CrossSiteHealthSummary = {
    total_sites: sites.length,
    healthy: 0,
    degraded: 0,
    critical: 0,
    auth_failed: 0,
    stale: 0,
    error: 0,
    stopped: 0,
    sites: [],
  };

  for (const site of sites) {
    const api = observationFactory(site);
    const health = await api.getHealth();

    switch (health.status) {
      case "healthy":
        summary.healthy++;
        break;
      case "degraded":
        summary.degraded++;
        break;
      case "critical":
        summary.critical++;
        break;
      case "auth_failed":
        summary.auth_failed++;
        break;
      case "stale":
        summary.stale++;
        break;
      case "error":
        summary.error++;
        break;
      case "stopped":
        summary.stopped++;
        break;
    }

    summary.sites.push({
      site_id: site.siteId,
      variant: site.variant,
      status: health.status,
      last_cycle_at: health.last_cycle_at,
      last_cycle_duration_ms: health.last_cycle_duration_ms,
      consecutive_failures: health.consecutive_failures,
      message: health.message,
      updated_at: health.updated_at,
    });
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Attention Queue Derivation
// ---------------------------------------------------------------------------

export type AttentionItemType =
  | "stuck_work_item"
  | "pending_outbound_command"
  | "pending_draft"
  | "critical_health"
  | "auth_failed_health"
  | "credential_required";

export type AttentionSeverity = "high" | "medium" | "low";

export interface AttentionRemediation {
  /** Command the operator should run (may contain placeholders like `<tenant-id>`). */
  command: string;
  /** Human-readable description of what the command does. */
  description: string;
}

export interface AttentionQueueItem {
  site_id: string;
  scope_id: string;
  item_type: AttentionItemType;
  /** Subtype for credential_required items (e.g. interactive_auth_required). */
  subtype?: string;
  item_id: string;
  severity: AttentionSeverity;
  summary: string;
  /** CLI command or URL to act on this item. */
  url_or_command: string;
  /** Operator-run remediation metadata. Never contains secret material. */
  remediation?: AttentionRemediation;
  occurred_at: string;
}

/**
 * Derive the attention queue across all registered Sites.
 *
 * Queries each Site for stuck items, critical health, and pending drafts,
 * then aggregates into a unified queue sorted by severity and recency.
 *
 * Never mutates Site state.
 */
export async function deriveAttentionQueue(
  registry: SiteRegistry,
  observationFactory: (site: RegisteredSite) => SiteObservationApi,
): Promise<AttentionQueueItem[]> {
  const sites = registry.listSites();
  const items: AttentionQueueItem[] = [];

  for (const site of sites) {
    const api = observationFactory(site);
    const health = await api.getHealth();

    // Critical health status → high severity attention item
    if (health.status === "critical") {
      items.push({
        site_id: site.siteId,
        scope_id: site.siteId,
        item_type: "critical_health",
        item_id: `health:${site.siteId}`,
        severity: "high",
        summary: `Site ${site.siteId} is critical: ${health.message}`,
        url_or_command: `narada status --site ${site.siteId}`,
        occurred_at: health.updated_at,
      });
    }

    // Auth failed health status → high severity attention item
    if (health.status === "auth_failed") {
      items.push({
        site_id: site.siteId,
        scope_id: site.siteId,
        item_type: "auth_failed_health",
        item_id: `health:${site.siteId}`,
        severity: "high",
        summary: `Site ${site.siteId} auth failed: ${health.message}`,
        url_or_command: `narada status --site ${site.siteId}`,
        occurred_at: health.updated_at,
      });
    }

    // Stuck work items
    const stuckWorkItems = await api.getStuckWorkItems();
    for (const stuck of stuckWorkItems) {
      items.push({
        site_id: site.siteId,
        scope_id: stuck.scope_id,
        item_type: "stuck_work_item",
        item_id: stuck.work_item_id,
        severity: stuck.status === "failed_retryable" ? "high" : "medium",
        summary: stuck.summary,
        url_or_command: `narada retry --site ${site.siteId} --work-item ${stuck.work_item_id}`,
        occurred_at: stuck.last_updated_at,
      });
    }

    // Pending outbound commands
    const pendingCommands = await api.getPendingOutboundCommands();
    for (const cmd of pendingCommands) {
      items.push({
        site_id: site.siteId,
        scope_id: cmd.scope_id,
        item_type: "pending_outbound_command",
        item_id: cmd.outbound_id,
        severity: "medium",
        summary: cmd.summary,
        url_or_command: `narada status --site ${site.siteId}`,
        occurred_at: cmd.created_at,
      });
    }

    // Pending drafts
    const pendingDrafts = await api.getPendingDrafts();
    for (const draft of pendingDrafts) {
      items.push({
        site_id: site.siteId,
        scope_id: draft.scope_id,
        item_type: "pending_draft",
        item_id: draft.draft_id,
        severity: "low",
        summary: draft.summary,
        url_or_command: `narada approve --site ${site.siteId} --draft ${draft.draft_id}`,
        occurred_at: draft.created_at,
      });
    }

    // Credential requirements
    const credentialRequirements = await api.getCredentialRequirements();
    for (const req of credentialRequirements) {
      items.push({
        site_id: site.siteId,
        scope_id: req.scope_id,
        item_type: "credential_required",
        subtype: req.subtype,
        item_id: req.requirement_id,
        severity: req.subtype === "interactive_auth_required" ? "high" : "medium",
        summary: req.summary,
        url_or_command: `narada status --site ${site.siteId}`,
        remediation: {
          command: req.remediation_command,
          description: req.remediation_description,
        },
        occurred_at: req.requested_at,
      });
    }
  }

  // Sort by severity (high > medium > low) then by recency (newest first)
  const severityRank: Record<AttentionSeverity, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };

  items.sort((a, b) => {
    const sevDiff = severityRank[a.severity] - severityRank[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return b.occurred_at.localeCompare(a.occurred_at);
  });

  return items;
}
