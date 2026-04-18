/**
 * Observation Scope Registry
 *
 * Owns the assembly of scope-api mappings used by the observation server.
 * This keeps the scope-to-observation binding logic out of daemon core files.
 */

import type { ObservationApiScope } from "./observation-server.js";
import type { WakeReason } from "./types.js";

export interface ScopeServiceLike {
  scope: { scope_id: string };
  dispatchContext: {
    getObservationApiScope(): Promise<ObservationApiScope>;
  };
}

export interface RegisterScopeApisOptions {
  requestWake?: (reason: WakeReason) => void;
}

export async function registerScopeApis(
  scopeServices: ScopeServiceLike[],
  options: RegisterScopeApisOptions,
  targetRegistry: Map<string, ObservationApiScope>,
): Promise<void> {
  for (const svc of scopeServices) {
    const apiScope = await svc.dispatchContext.getObservationApiScope();
    targetRegistry.set(svc.scope.scope_id, {
      ...apiScope,
      requestWake: options.requestWake,
    });
  }
}
