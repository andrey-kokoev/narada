/**
 * Explicit local site context for the resolver. Launcher/session
 * boundaries transport THIS — sites, principal, execution mode — never
 * provider or model selections.
 */

import type { AuthoritativeDecisionClock, ResourceRef } from "@narada2/invokable-intelligence-contract";
import type { ResolverContext } from "@narada2/invokable-intelligence-resolver";

export interface LocalSiteContext {
  targetSite: ResourceRef;
  userSite: ResourceRef;
  hostSite: ResourceRef;
}

export function buildResolverContext(
  sites: LocalSiteContext,
  input: {
    clock: AuthoritativeDecisionClock;
    runtime: ResolverContext["runtime"];
    access: ResolverContext["access"];
    topologyObservations: ResolverContext["topology_observations"];
  },
): ResolverContext {
  return {
    targetSite: sites.targetSite,
    userSite: sites.userSite,
    hostSite: sites.hostSite,
    runtime: input.runtime,
    clock: input.clock,
    access: input.access,
    topology_observations: input.topologyObservations,
  };
}
