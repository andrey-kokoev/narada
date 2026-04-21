/**
 * Cycle Entrypoint
 */

import { runCycle, type CycleResult } from "./runner.js";
import type { CloudflareEnv } from "./coordinator.js";

export interface CycleRequest {
  scope_id: string;
  context_id?: string;
  correlation_id?: string;
}

export interface CycleResponse {
  status: "accepted" | "rejected" | "error";
  correlation_id: string;
  detail: string;
  result?: CycleResult;
}

export async function invokeCycle(
  req: CycleRequest,
  env: CloudflareEnv,
): Promise<CycleResponse> {
  const correlationId = req.correlation_id ?? `corr_${Date.now()}`;
  try {
    // TODO(Task 330 drift): req.scope_id is passed as siteId. These concepts
    // coincide for v0 single-Site setups, but multi-scope/multi-Site requires
    // an explicit scope_id → site_id resolution layer. Deferred to v1.
    const result = await runCycle(req.scope_id, env);
    if (result.status === "failed" && result.steps_completed.length === 0) {
      return { status: "rejected", correlation_id: correlationId, detail: result.error ?? "Lock failed", result };
    }
    return { status: "accepted", correlation_id: correlationId, detail: `Cycle ${result.cycle_id} ${result.status}`, result };
  } catch (err) {
    return { status: "error", correlation_id: correlationId, detail: err instanceof Error ? err.message : String(err) };
  }
}
