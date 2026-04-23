/**
 * Cloudflare Site console adapter.
 *
 * Bridges the Operator Console to remote Cloudflare Worker Sites via HTTP.
 * Observation calls GET /status; control calls POST /control/actions.
 */

import type {
  ConsoleSiteAdapter,
  RegisteredSite,
  SiteObservationApi,
  SiteHealthRecord,
  SiteControlClient,
  ConsoleControlRequest,
  ControlRequestResult,
  StuckWorkItem,
  PendingOutboundCommand,
  PendingDraft,
  CredentialRequirement,
} from "@narada2/windows-site";

function resolveCloudflareToken(siteId: string): string | undefined {
  const envKey = `NARADA_CLOUDFLARE_TOKEN_${siteId.toUpperCase().replace(/-/g, "_")}`;
  return process.env[envKey];
}

function isCloudflareSite(site: RegisteredSite): boolean {
  return site.variant === "cloudflare" || site.substrate === "cloudflare";
}

export class CloudflareSiteObservationApi implements SiteObservationApi {
  private site: RegisteredSite;
  private token: string | undefined;

  constructor(site: RegisteredSite) {
    this.site = site;
    this.token = resolveCloudflareToken(site.siteId);
  }

  private endpoint(path: string): string {
    const base = this.site.controlEndpoint ?? "";
    // Ensure no trailing slash on base, no leading slash on path
    const cleanBase = base.replace(/\/$/, "");
    const cleanPath = path.replace(/^\//, "");
    return `${cleanBase}/${cleanPath}`;
  }

  async getHealth(): Promise<SiteHealthRecord> {
    const url = new URL(this.endpoint("status"));
    url.searchParams.set("site_id", this.site.siteId);

    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const response = await fetch(url.toString(), { headers });
    if (!response.ok) {
      const isAuthFailure = response.status === 401;
      return {
        site_id: this.site.siteId,
        status: isAuthFailure ? "auth_failed" : "error",
        last_cycle_at: null,
        last_cycle_duration_ms: null,
        consecutive_failures: 0,
        message: `Cloudflare status request failed: ${response.status} ${response.statusText}`,
        updated_at: new Date().toISOString(),
      };
    }

    const body = (await response.json()) as {
      health?: {
        status?: string;
        last_cycle_at?: string | null;
        last_cycle_status?: string | null;
        pending_work_items?: number;
        locked?: boolean;
        locked_by_cycle_id?: string | null;
      };
      last_cycle?: {
        started_at?: string;
        finished_at?: string;
        status?: string;
      } | null;
    };

    const health = body.health ?? {};
    const lastCycle = body.last_cycle;

    const mapStatus = (
      s?: string
    ): SiteHealthRecord["status"] => {
      if (s === "healthy") return "healthy";
      if (s === "degraded") return "degraded";
      return "critical";
    };

    let lastCycleDurationMs: number | null = null;
    if (lastCycle?.started_at && lastCycle?.finished_at) {
      lastCycleDurationMs =
        new Date(lastCycle.finished_at).getTime() -
        new Date(lastCycle.started_at).getTime();
    }

    return {
      site_id: this.site.siteId,
      status: mapStatus(health.status),
      last_cycle_at: health.last_cycle_at ?? null,
      last_cycle_duration_ms: lastCycleDurationMs,
      consecutive_failures: 0, // Not exposed by Cloudflare v0 endpoint
      message: health.last_cycle_status ?? "OK",
      updated_at: new Date().toISOString(),
    };
  }

  async getStuckWorkItems(): Promise<StuckWorkItem[]> {
    // Cloudflare Worker does not yet expose stuck-work-items endpoint.
    // Residual: add GET /scopes/:scope_id/stuck-work-items to Cloudflare Site.
    return [];
  }

  async getPendingOutboundCommands(): Promise<PendingOutboundCommand[]> {
    // Cloudflare Worker does not yet expose pending-outbounds endpoint.
    // Residual: add GET /scopes/:scope_id/pending-outbounds to Cloudflare Site.
    return [];
  }

  async getPendingDrafts(): Promise<PendingDraft[]> {
    // Cloudflare Worker does not yet expose pending-drafts endpoint.
    // Residual: add GET /scopes/:scope_id/pending-drafts to Cloudflare Site.
    return [];
  }

  async getCredentialRequirements(): Promise<CredentialRequirement[]> {
    const health = await this.getHealth();
    if (health.status === "auth_failed") {
      return [
        {
          requirement_id: `auth:${this.site.siteId}`,
          scope_id: this.site.siteId,
          subtype: "interactive_auth_required",
          summary: health.message,
          remediation_command: `narada auth --site ${this.site.siteId}`,
          remediation_description:
            "Re-authenticate the Cloudflare Site's admin token",
          requested_at: health.updated_at,
        },
      ];
    }
    return [];
  }
}

export class CloudflareSiteControlClient implements SiteControlClient {
  private site: RegisteredSite;
  private token: string | undefined;

  constructor(site: RegisteredSite) {
    this.site = site;
    this.token = resolveCloudflareToken(site.siteId);
  }

  private endpoint(path: string): string {
    const base = this.site.controlEndpoint ?? "";
    const cleanBase = base.replace(/\/$/, "");
    const cleanPath = path.replace(/^\//, "");
    return `${cleanBase}/${cleanPath}`;
  }

  async executeControlRequest(
    request: ConsoleControlRequest
  ): Promise<ControlRequestResult> {
    const scopeId = request.scopeId ?? "default";
    const url = new URL(this.endpoint("control/actions"));
    url.searchParams.set("site_id", this.site.siteId);
    url.searchParams.set("scope_id", scopeId);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const body = {
      action_type: request.actionType,
      target_id: request.targetId,
      payload_json: request.payload ? JSON.stringify(request.payload) : undefined,
    };

    try {
      const response = await fetch(url.toString(), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (response.status === 401) {
        return {
          success: false,
          status: "error",
          detail: "Cloudflare Site authentication failed. Check NARADA_CLOUDFLARE_TOKEN_* env var.",
        };
      }

      const responseBody = (await response.json()) as {
        success?: boolean;
        request_id?: string;
        status?: string;
        reason?: string;
      };

      if (response.ok && responseBody.success) {
        return {
          success: true,
          status: "accepted",
          detail: responseBody.request_id,
        };
      }

      if (response.status === 422) {
        return {
          success: false,
          status: "rejected",
          detail: responseBody.reason ?? "Site rejected the action",
        };
      }

      return {
        success: false,
        status: "error",
        detail:
          responseBody.reason ??
          `Cloudflare Site returned ${response.status}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        status: "error",
        detail: `Failed to reach Cloudflare Site: ${message}`,
      };
    }
  }
}

/**
 * Cloudflare Site console adapter.
 *
 * Routes observation and control requests to a remote Cloudflare Worker
 * via HTTP using Bearer token authentication.
 */
export const cloudflareSiteAdapter: ConsoleSiteAdapter = {
  supports(site) {
    return isCloudflareSite(site);
  },

  createObservationApi(site) {
    return new CloudflareSiteObservationApi(site);
  },

  createControlClient(site) {
    return new CloudflareSiteControlClient(site);
  },
};
