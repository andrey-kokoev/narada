/**
 * Explicit local site context for the resolver. Launcher/session
 * boundaries transport THIS — sites, principal, execution mode — never
 * provider or model selections.
 */

import type { ResourceRef } from "@narada2/invokable-intelligence-contract";
import type { ResolverContext } from "@narada2/invokable-intelligence-resolver";

export interface LocalSiteContext {
  targetSite: ResourceRef;
  userSite: ResourceRef;
  hostSite: ResourceRef;
}

export function buildResolverContext(
  sites: LocalSiteContext,
  options: { time?: string; runtime?: ResolverContext["runtime"] } = {},
): ResolverContext {
  return {
    targetSite: sites.targetSite,
    userSite: sites.userSite,
    hostSite: sites.hostSite,
    runtime: options.runtime ?? "node",
    time: options.time ?? new Date().toISOString(),
  };
}
