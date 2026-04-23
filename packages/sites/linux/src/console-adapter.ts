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
import { resolveSiteRoot } from "./path-utils.js";
import type { LinuxSiteMode } from "./types.js";

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
    // v0 Linux Sites do not have a work_items table.
    return [];
  }

  async getPendingOutboundCommands(): Promise<PendingOutboundCommand[]> {
    // v0 Linux Sites do not have an outbound_handoffs table.
    return [];
  }

  async getPendingDrafts(): Promise<PendingDraft[]> {
    // v0 Linux Sites do not have an outbound_handoffs table.
    return [];
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
 * Control client for Linux Sites.
 *
 * v0 Linux Sites do not yet implement operator actions. All control requests
 * return an explicit unsupported error.
 */
export class LinuxSiteControlClient implements SiteControlClient {
  private _siteId: string;

  constructor(siteId: string) {
    this._siteId = siteId;
  }

  async executeControlRequest(
    request: ConsoleControlRequest
  ): Promise<ControlRequestResult> {
    return {
      success: false,
      status: "error",
      detail:
        `Linux Site '${this._siteId}' control is not yet implemented in v0. ` +
        `Action '${request.actionType}' on target '${request.targetId}' ` +
        `cannot be executed. Linux Sites do not yet support operator actions.`,
    };
  }
}

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
    return new LinuxSiteControlClient(site.siteId);
  },
};
