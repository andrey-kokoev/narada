/**
 * Substrate-neutral console adapter contract.
 *
 * Each substrate package exports an adapter that the CLI uses to resolve
 * observation and control surfaces without hardcoding substrate semantics.
 */

import type { RegisteredSite } from "./registry.js";
import type { SiteObservationApi } from "./site-observation.js";
import type { SiteHealthRecord } from "./types.js";
import type { SiteControlClient, ConsoleControlRequest, ControlRequestResult } from "./router.js";
import { createWindowsSiteObservationApi } from "./observability.js";
import { createWindowsSiteControlClient } from "./site-control.js";
import type { WindowsSiteVariant } from "./types.js";

/**
 * A console adapter binds a substrate to the generic observation and control
 * interfaces used by the Operator Console.
 */
export interface ConsoleSiteAdapter {
  /** Return true if this adapter can handle the given site. */
  supports(site: RegisteredSite): boolean;
  /** Create an observation API for the site. */
  createObservationApi(site: RegisteredSite): SiteObservationApi;
  /** Create a control client for the site. */
  createControlClient(site: RegisteredSite): SiteControlClient;
}

function isWindowsVariant(variant: string): variant is WindowsSiteVariant {
  return variant === "native" || variant === "wsl";
}

function isNativeWindows(): boolean {
  return process.platform === "win32";
}

function isWslPathAccessibleFromWindows(siteRoot: string): boolean {
  return (
    siteRoot.startsWith("\\\\wsl$\\") ||
    siteRoot.startsWith("\\\\wsl.localhost\\")
  );
}

function wslBridgeError(siteId: string): string {
  return (
    `WSL Site '${siteId}' cannot be accessed from native Windows. ` +
    `Run the console inside WSL (e.g., 'wsl -d <distro> -e narada console ...'), ` +
    `or register the Site with a Windows-accessible path (\\\\wsl$\\...).`
  );
}

/**
 * Observation API that returns a bridge-required error for WSL Sites
 * accessed from native Windows.
 */
class WslBridgeRequiredObservationApi implements SiteObservationApi {
  private site: RegisteredSite;

  constructor(site: RegisteredSite) {
    this.site = site;
  }

  getHealth(): SiteHealthRecord {
    return {
      site_id: this.site.siteId,
      status: "error",
      last_cycle_at: null,
      last_cycle_duration_ms: null,
      consecutive_failures: 0,
      message: wslBridgeError(this.site.siteId),
      updated_at: new Date().toISOString(),
    };
  }

  getStuckWorkItems() {
    return [];
  }

  getPendingOutboundCommands() {
    return [];
  }

  getPendingDrafts() {
    return [];
  }

  getCredentialRequirements() {
    return [];
  }
}

/**
 * Control client that returns a bridge-required error for WSL Sites
 * accessed from native Windows.
 */
class WslBridgeRequiredControlClient implements SiteControlClient {
  private siteId: string;

  constructor(siteId: string) {
    this.siteId = siteId;
  }

  async executeControlRequest(
    _request: ConsoleControlRequest
  ): Promise<ControlRequestResult> {
    return {
      success: false,
      status: "error",
      detail: wslBridgeError(this.siteId),
    };
  }
}

/**
 * Windows Site console adapter.
 *
 * Opens local SQLite databases for observation and delegates control
 * requests to executeOperatorAction via WindowsSiteControlClient.
 */
export const windowsSiteAdapter: ConsoleSiteAdapter = {
  supports(site) {
    return site.substrate === "windows" && isWindowsVariant(site.variant);
  },

  createObservationApi(site) {
    if (
      site.variant === "wsl" &&
      isNativeWindows() &&
      !isWslPathAccessibleFromWindows(site.siteRoot)
    ) {
      return new WslBridgeRequiredObservationApi(site);
    }
    return createWindowsSiteObservationApi(
      site.siteId,
      site.variant as WindowsSiteVariant
    );
  },

  createControlClient(site) {
    if (
      site.variant === "wsl" &&
      isNativeWindows() &&
      !isWslPathAccessibleFromWindows(site.siteRoot)
    ) {
      return new WslBridgeRequiredControlClient(site.siteId);
    }
    const client = createWindowsSiteControlClient(site);
    if (!client) {
      throw new Error(
        `WindowsSiteControlClient could not be created for site ${site.siteId}`
      );
    }
    return client;
  },
};
