/**
 * Linux Site console adapter.
 *
 * Bridges the Operator Console to local Linux Sites (user-mode and system-mode)
 * through the same substrate-neutral adapter interface used by Windows and Cloudflare.
 *
 * Observation reads from the Site's coordinator SQLite (site_health, cycle_traces).
 * Control returns explicit unsupported errors because v0 Linux Sites do not yet
 * implement operator actions.
 */

import { accessSync, constants } from "node:fs";
import type {
  ConsoleSiteAdapter,
  RegisteredSite,
  SiteObservationApi,
  SiteControlClient,
  ConsoleControlRequest,
  ControlRequestResult,
  SiteHealthRecord,
  StuckWorkItem,
  PendingOutboundCommand,
  PendingDraft,
  CredentialRequirement,
} from "@narada2/windows-site";
import {
  getSiteHealth,
  resolveLinuxSiteMode,
} from "./observability.js";
import { resolveSiteRoot, siteDbPath } from "./path-utils.js";
import type { LinuxSiteMode } from "./types.js";
import { createLinuxSiteControlClient } from "./site-control.js";

function isLinuxVariant(variant: string): variant is "linux-user" | "linux-system" {
  return variant === "linux-user" || variant === "linux-system";
}

function resolveMode(site: RegisteredSite): LinuxSiteMode {
  if (isLinuxVariant(site.variant)) {
    return site.variant === "linux-system" ? "system" : "user";
  }
  // Fallback: infer from filesystem
  const detected = resolveLinuxSiteMode(site.siteId);
  if (detected) return detected;
  return "user";
}

/**
 * Observation API for Linux Sites.
 *
 * Queries the Site's coordinator SQLite directly. Never mutates Site state.
 * v0 Linux Sites only have site_health and cycle_traces tables;
 * work_items, outbound_handoffs, and drafts are not yet implemented.
 */
export class LinuxSiteObservationApi implements SiteObservationApi {
  private siteId: string;
  private mode: LinuxSiteMode;

  constructor(siteId: string, mode: LinuxSiteMode) {
    this.siteId = siteId;
    this.mode = mode;
  }

  async getHealth(): Promise<SiteHealthRecord> {
    try {
      return await getSiteHealth(this.siteId, this.mode);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        site_id: this.siteId,
        status: "error",
        last_cycle_at: null,
        last_cycle_duration_ms: null,
        consecutive_failures: 0,
        message: `Failed to read Linux Site health: ${message}`,
        updated_at: new Date().toISOString(),
      };
    }
  }

  async getStuckWorkItems(): Promise<StuckWorkItem[]> {
    const { default: DatabaseCtor } = await import("better-sqlite3");
    const db = new DatabaseCtor(siteDbPath(this.siteId, this.mode));
    try {
      const tableCheck = db.prepare(
        `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'work_items'`
      ).get() as { "1": number } | undefined;
      if (!tableCheck) return [];

      const rows = db.prepare(
        `SELECT
           work_item_id,
           scope_id,
           status,
           context_id,
           updated_at AS last_updated_at,
           COALESCE(error_message, status) AS summary
         FROM work_items
         WHERE status IN ('failed_retryable', 'leased', 'executing')
           AND (
             (status = 'leased' AND updated_at < datetime('now', '-120 minutes'))
             OR (status = 'executing' AND updated_at < datetime('now', '-30 minutes'))
             OR (status = 'failed_retryable')
           )
         ORDER BY priority DESC, updated_at ASC`
      ).all() as Array<{
        work_item_id: string;
        scope_id: string;
        status: string;
        context_id: string;
        last_updated_at: string;
        summary: string;
      }>;

      return rows.map((r) => ({
        work_item_id: r.work_item_id,
        scope_id: r.scope_id,
        status: r.status as StuckWorkItem["status"],
        context_id: r.context_id,
        last_updated_at: r.last_updated_at,
        summary: r.summary,
      }));
    } finally {
      db.close();
    }
  }

  async getPendingOutboundCommands(): Promise<PendingOutboundCommand[]> {
    const { default: DatabaseCtor } = await import("better-sqlite3");
    const db = new DatabaseCtor(siteDbPath(this.siteId, this.mode));
    try {
      const tableCheck = db.prepare(
        `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'outbound_handoffs'`
      ).get() as { "1": number } | undefined;
      if (!tableCheck) return [];

      const rows = db.prepare(
        `SELECT
           outbound_id,
           scope_id,
           context_id,
           action_type,
           status,
           created_at,
           action_type || ' — ' || status AS summary
         FROM outbound_handoffs
         WHERE status IN ('pending', 'draft_creating', 'sending')
           AND (
             (status = 'pending' AND created_at < datetime('now', '-15 minutes'))
             OR (status = 'draft_creating' AND created_at < datetime('now', '-10 minutes'))
             OR (status = 'sending' AND created_at < datetime('now', '-5 minutes'))
           )
         ORDER BY created_at ASC`
      ).all() as Array<{
        outbound_id: string;
        scope_id: string;
        context_id: string;
        action_type: string;
        status: string;
        created_at: string;
        summary: string;
      }>;

      return rows.map((r) => ({
        outbound_id: r.outbound_id,
        scope_id: r.scope_id,
        context_id: r.context_id,
        action_type: r.action_type,
        status: r.status,
        created_at: r.created_at,
        summary: r.summary,
      }));
    } finally {
      db.close();
    }
  }

  async getPendingDrafts(): Promise<PendingDraft[]> {
    const { default: DatabaseCtor } = await import("better-sqlite3");
    const db = new DatabaseCtor(siteDbPath(this.siteId, this.mode));
    try {
      const tableCheck = db.prepare(
        `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'outbound_handoffs'`
      ).get() as { "1": number } | undefined;
      if (!tableCheck) return [];

      const rows = db.prepare(
        `SELECT
           outbound_id AS draft_id,
           scope_id,
           context_id,
           status,
           created_at,
           action_type || ' draft' AS summary
         FROM outbound_handoffs
         WHERE status = 'draft_ready'
         ORDER BY created_at ASC`
      ).all() as Array<{
        draft_id: string;
        scope_id: string;
        context_id: string;
        status: string;
        created_at: string;
        summary: string;
      }>;

      return rows.map((r) => ({
        draft_id: r.draft_id,
        scope_id: r.scope_id,
        context_id: r.context_id,
        status: r.status as PendingDraft["status"],
        created_at: r.created_at,
        summary: r.summary,
      }));
    } finally {
      db.close();
    }
  }

  async getCredentialRequirements(): Promise<CredentialRequirement[]> {
    const health = await this.getHealth();
    if (health.status === "auth_failed") {
      return [
        {
          requirement_id: `auth:${this.siteId}`,
          scope_id: this.siteId,
          subtype: "interactive_auth_required",
          summary: health.message,
          remediation_command: `narada auth --site ${this.siteId}`,
          remediation_description:
            "Re-authenticate the Site's source connection",
          requested_at: health.updated_at,
        },
      ];
    }
    return [];
  }
}

/**
 * Re-export the canonical LinuxSiteControlClient from site-control.
 *
 * The implementation routes console actions through executeOperatorAction
 * on the Site's local SQLite database, following the same pattern as Windows.
 */
export { LinuxSiteControlClient } from "./site-control.js";

/**
 * Control client returned when a system-mode Linux Site is not readable
 * by the current user.
 */
export class UnauthorizedLinuxSiteControlClient implements SiteControlClient {
  private _siteId: string;

  constructor(siteId: string) {
    this._siteId = siteId;
  }

  async executeControlRequest(
    _request: ConsoleControlRequest
  ): Promise<ControlRequestResult> {
    return {
      success: false,
      status: "error",
      detail:
        `System-mode Linux Site '${this._siteId}' is not readable. ` +
        `Run with appropriate privileges or use a user-mode Site.`,
    };
  }
}

/**
 * Linux Site console adapter.
 *
 * Supports local POSIX Sites in user-mode and system-mode.
 * Observation is read-only. Control returns explicit unsupported errors.
 */
export const linuxSiteAdapter: ConsoleSiteAdapter = {
  supports(site) {
    return isLinuxVariant(site.variant) || site.substrate === "linux";
  },

  createObservationApi(site) {
    const mode = resolveMode(site);
    return new LinuxSiteObservationApi(site.siteId, mode);
  },

  createControlClient(site) {
    const mode = resolveMode(site);
    if (mode === "system") {
      const siteRoot = resolveSiteRoot(site.siteId, "system");
      try {
        accessSync(siteRoot, constants.R_OK);
      } catch {
        return new UnauthorizedLinuxSiteControlClient(site.siteId);
      }
    }
    const client = createLinuxSiteControlClient(site.siteId, mode);
    if (!client) {
      throw new Error(
        `LinuxSiteControlClient could not be created for site ${site.siteId}`
      );
    }
    return client;
  },
};
