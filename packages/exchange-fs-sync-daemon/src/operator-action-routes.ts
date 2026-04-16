/**
 * Operator action routes — the only permitted write path from the operator console.
 *
 * Authority boundary (Task 073/074/083):
 * - This module contains ONLY the POST /control/scopes/:id/actions route.
 * - Every action is validated, audited, and delegated to executeOperatorAction.
 * - No direct store mutations from route handlers.
 * - Control namespace is explicitly separated from observation namespace.
 */

import type { ServerResponse, IncomingMessage } from "http";
import { executeOperatorAction, type OperatorActionPayload } from "./operator-actions.js";
import type { RouteHandler } from "./routes.js";
import type { ObservationApiScope } from "./observation-server.js";

export function createOperatorActionRoutes(
  prefix: string,
  scopeApis: Map<string, ObservationApiScope>,
): RouteHandler[] {
  function getScope(scopeId: string): ObservationApiScope | undefined {
    return scopeApis.get(scopeId);
  }

  function jsonResponse(res: ServerResponse, status: number, payload: unknown): void {
    const body = JSON.stringify(payload);
    res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
    res.end(body);
  }

  return [
    {
      method: "POST",
      pattern: new RegExp(`^${prefix}/control/scopes/([^/]+)/actions$`),
      handler: async (req: IncomingMessage, res: ServerResponse, params: RegExpExecArray) => {
        const scope = getScope(params[1]!);
        if (!scope) {
          jsonResponse(res, 404, { error: "Scope not found" });
          return;
        }

        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 65536) {
            jsonResponse(res, 413, { error: "Payload too large" });
            return;
          }
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(body);
        } catch {
          jsonResponse(res, 400, { error: "Invalid JSON" });
          return;
        }

        const payload = parsed as OperatorActionPayload;
        if (!payload.action_type || typeof payload.action_type !== "string") {
          jsonResponse(res, 400, { error: "Missing or invalid action_type" });
          return;
        }

        const result = await executeOperatorAction(
          {
            scope_id: scope.scope_id,
            coordinatorStore: scope.coordinatorStore,
            rebuildViews: scope.rebuildViews,
            runDispatchPhase: scope.runDispatchPhase,
          },
          payload,
        );

        if (result.status === "executed") {
          jsonResponse(res, 200, result);
        } else {
          jsonResponse(res, 422, result);
        }
      },
    },
  ];
}
