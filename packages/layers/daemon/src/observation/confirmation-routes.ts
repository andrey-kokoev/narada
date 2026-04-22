/**
 * Confirmation routes for email-originated operator requests.
 *
 * Routes:
 * - POST /control/scopes/:scope_id/operator-requests/:request_id/confirmation-link
 * - GET  /control/auth/microsoft/start?challenge_id=...&state=...
 * - GET  /control/auth/microsoft/callback
 *
 * Authority:
 * - These routes execute only through executeOperatorAction() after successful
 *   Microsoft auth verification.
 * - No direct store mutations from route handlers.
 */

import type { ServerResponse, IncomingMessage } from "http";
import type { RouteHandler } from "./routes.js";
import type { ObservationApiScope } from "./observation-server.js";
import {
  executeOperatorAction,
  verifyChallengeState,
  verifyMicrosoftAuth,
  base64UrlJwtDecoder,
  createMicrosoftTokenExchangeClient,
  getMicrosoftAuthUrl,
  generateChallengeTokens,
  type TokenExchangeClient,
  type TokenDecoder,
} from "@narada2/control-plane";

export interface ConfirmationRouteOptions {
  tokenExchange?: TokenExchangeClient;
  tokenDecoder?: TokenDecoder;
}

export function createConfirmationRoutes(
  prefix: string,
  scopeApis: Map<string, ObservationApiScope>,
  options: ConfirmationRouteOptions = {},
): RouteHandler[] {
  const tokenExchange = options.tokenExchange ?? createMicrosoftTokenExchangeClient();
  const tokenDecoder = options.tokenDecoder ?? base64UrlJwtDecoder;

  function getScope(scopeId: string): ObservationApiScope | undefined {
    return scopeApis.get(scopeId);
  }

  function jsonResponse(res: ServerResponse, status: number, payload: unknown): void {
    const body = JSON.stringify(payload);
    res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
    res.end(body);
  }

  function redirectResponse(res: ServerResponse, url: string): void {
    res.writeHead(302, { Location: url });
    res.end();
  }

  return [
    {
      method: "POST",
      pattern: new RegExp(`^${prefix}/control/scopes/([^/]+)/operator-requests/([^/]+)/confirmation-link$`),
      handler: async (_req: IncomingMessage, res: ServerResponse, params: RegExpExecArray) => {
        const scope = getScope(params[1]!);
        if (!scope) {
          jsonResponse(res, 404, { error: "Scope not found" });
          return;
        }

        const requestId = params[2]!;
        const db = scope.coordinatorStore.db;

        const requestRow = db.prepare(
          `select * from operator_action_requests where request_id = ? and scope_id = ?`,
        ).get(requestId, scope.scope_id) as Record<string, unknown> | undefined;

        if (!requestRow) {
          jsonResponse(res, 404, { error: "Operator action request not found" });
          return;
        }

        if (String(requestRow.status) !== "pending") {
          jsonResponse(res, 409, { error: "Request is not pending" });
          return;
        }

        const contacts = scope.scopeConfig.operator_contacts ?? [];
        const requestedBy = String(requestRow.requested_by ?? "");
        const contact = contacts.find((c) => c.principal_id === requestedBy);

        if (!contact) {
          jsonResponse(res, 403, { error: "No operator contact found for request" });
          return;
        }

        const providers = scope.scopeConfig.confirmation_providers;
        const providerConfig = contact.identity_provider === "microsoft_entra"
          ? providers?.microsoft_entra
          : undefined;

        if (!providerConfig) {
          jsonResponse(res, 500, { error: `Provider not configured: ${contact.identity_provider}` });
          return;
        }

        const { createConfirmationChallenge, buildConfirmationUrl } = await import("@narada2/control-plane");
        const { challenge, state_token } = createConfirmationChallenge({
          scope_id: scope.scope_id,
          operator_action_request_id: requestId,
          principal_id: contact.principal_id,
          provider: contact.identity_provider,
        });

        scope.coordinatorStore.insertConfirmationChallenge(challenge);

        const confirmationUrl = buildConfirmationUrl(
          providerConfig.redirect_base_url,
          challenge.challenge_id,
          state_token,
        );

        jsonResponse(res, 200, {
          challenge_id: challenge.challenge_id,
          confirmation_url: confirmationUrl,
          expires_at: challenge.expires_at,
        });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/control/auth/microsoft/start$`),
      handler: async (_req: IncomingMessage, res: ServerResponse, _params: RegExpExecArray, searchParams: URLSearchParams) => {
        const challengeId = searchParams.get("challenge_id");
        const stateToken = searchParams.get("state");

        if (!challengeId || !stateToken) {
          jsonResponse(res, 400, { error: "Missing challenge_id or state" });
          return;
        }

        let challenge: import("@narada2/control-plane").ConfirmationChallenge | undefined;
        let scope: ObservationApiScope | undefined;
        for (const [, s] of scopeApis) {
          const c = s.coordinatorStore.getConfirmationChallenge(challengeId);
          if (c) {
            challenge = c;
            scope = s;
            break;
          }
        }

        if (!challenge || !scope) {
          jsonResponse(res, 404, { error: "Challenge not found" });
          return;
        }

        const verifyResult = verifyChallengeState(challenge, stateToken, stateToken);
        if (!verifyResult.ok) {
          jsonResponse(res, 403, { error: verifyResult.error });
          return;
        }

        const providers = scope.scopeConfig.confirmation_providers;
        const providerConfig = providers?.microsoft_entra;
        if (!providerConfig) {
          jsonResponse(res, 500, { error: "Microsoft Entra provider not configured" });
          return;
        }

        // Generate fresh tokens for the Microsoft OAuth redirect
        const fresh = generateChallengeTokens();
        const { createHash } = await import("node:crypto");
        const newStateHash = createHash("sha256").update(fresh.state_token).digest("hex");
        const newNonceHash = createHash("sha256").update(fresh.nonce).digest("hex");

        scope.coordinatorStore.updateChallengeTokens(challenge.challenge_id, newStateHash, newNonceHash);

        const authUrl = getMicrosoftAuthUrl(providerConfig, `${challenge.challenge_id}:${fresh.state_token}`, fresh.nonce);
        redirectResponse(res, authUrl);
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/control/auth/microsoft/callback$`),
      handler: async (_req: IncomingMessage, res: ServerResponse, _params: RegExpExecArray, searchParams: URLSearchParams) => {
        const code = searchParams.get("code");
        const state = searchParams.get("state");
        const error = searchParams.get("error");
        const errorDescription = searchParams.get("error_description");

        if (error) {
          jsonResponse(res, 400, { error: `microsoft_auth_error: ${error}`, description: errorDescription });
          return;
        }

        if (!code || !state) {
          jsonResponse(res, 400, { error: "Missing code or state" });
          return;
        }

        const stateParts = state.split(":");
        if (stateParts.length !== 2) {
          jsonResponse(res, 400, { error: "Invalid state format" });
          return;
        }

        const challengeId = stateParts[0]!;
        const oauthState = stateParts[1]!;

        let challenge: import("@narada2/control-plane").ConfirmationChallenge | undefined;
        let scope: ObservationApiScope | undefined;
        for (const [, s] of scopeApis) {
          const c = s.coordinatorStore.getConfirmationChallenge(challengeId);
          if (c) {
            challenge = c;
            scope = s;
            break;
          }
        }

        if (!challenge || !scope) {
          jsonResponse(res, 404, { error: "Challenge not found" });
          return;
        }

        const { createHash } = await import("node:crypto");
        const stateHash = createHash("sha256").update(oauthState).digest("hex");
        if (challenge.state_hash !== stateHash) {
          jsonResponse(res, 403, { error: "invalid_state" });
          return;
        }

        if (challenge.status !== "pending") {
          jsonResponse(res, 409, { error: `challenge_already_${challenge.status}` });
          return;
        }

        const now = new Date();
        const expiresAt = new Date(challenge.expires_at);
        if (now > expiresAt) {
          scope.coordinatorStore.markConfirmationChallengeExpired(challenge.challenge_id);
          jsonResponse(res, 403, { error: "challenge_expired" });
          return;
        }

        const providers = scope.scopeConfig.confirmation_providers;
        const providerConfig = providers?.microsoft_entra;
        if (!providerConfig) {
          jsonResponse(res, 500, { error: "Microsoft Entra provider not configured" });
          return;
        }

        const contacts = scope.scopeConfig.operator_contacts ?? [];
        const contact = contacts.find((c) => c.principal_id === challenge.principal_id);
        if (!contact) {
          jsonResponse(res, 403, { error: "Contact not found for challenge" });
          return;
        }

        const verifyResult = await verifyMicrosoftAuth({
          code,
          provider: providerConfig,
          expectedTenantId: contact.tenant_id,
          expectedClientId: providerConfig.client_id,
          expectedEntraUserId: contact.entra_user_id,
          tokenExchange,
          tokenDecoder,
        });

        if (!verifyResult.ok) {
          scope.coordinatorStore.markConfirmationChallengeRejected(
            challenge.challenge_id,
            verifyResult.error ?? "verification_failed",
          );
          jsonResponse(res, 403, { error: verifyResult.error, claims: verifyResult.claims });
          return;
        }

        // Verify nonce from id_token against stored hash
        const nonceFromToken = verifyResult.claims?.nonce ?? "";
        const nonceHash = createHash("sha256").update(nonceFromToken).digest("hex");
        if (challenge.nonce_hash !== nonceHash) {
          scope.coordinatorStore.markConfirmationChallengeRejected(
            challenge.challenge_id,
            "nonce_mismatch",
          );
          jsonResponse(res, 403, { error: "nonce_mismatch" });
          return;
        }

        // Mark challenge confirmed
        scope.coordinatorStore.markConfirmationChallengeConfirmed(challenge.challenge_id);

        // Load the operator action request
        const requestRow = scope.coordinatorStore.db.prepare(
          `select * from operator_action_requests where request_id = ? and scope_id = ?`,
        ).get(challenge.operator_action_request_id, scope.scope_id) as Record<string, unknown> | undefined;

        if (!requestRow) {
          jsonResponse(res, 404, { error: "Operator action request not found" });
          return;
        }

        const actionType = String(requestRow.action_type ?? "");
        const targetId = requestRow.target_id ? String(requestRow.target_id) : undefined;
        const payloadJson = requestRow.payload_json ? String(requestRow.payload_json) : undefined;

        // Execute via canonical path
        const execResult = await executeOperatorAction(
          {
            scope_id: scope.scope_id,
            coordinatorStore: scope.coordinatorStore,
            outboundStore: scope.outboundStore,
            intentStore: scope.intentStore,
            rebuildViews: scope.rebuildViews,
            rebuildProjections: scope.rebuildProjections,
            runDispatchPhase: scope.runDispatchPhase,
            requestWake: scope.requestWake,
            deriveWork: async (options) => {
              const facts = scope.factStore.getFactsByScope(scope.scope_id, {
                contextIds: options.contextId ? [options.contextId] : undefined,
                since: options.since,
                factIds: options.factIds,
                limit: 1000,
              });
              const result = await scope.foreman.deriveWorkFromStoredFacts(facts, scope.scope_id);
              return {
                opened: result.opened.length,
                superseded: result.superseded.length,
                nooped: result.nooped.length,
              };
            },
            previewWork: scope.previewWork
              ? async (options) => scope.previewWork!(options)
              : undefined,
          },
          {
            action_type: actionType as import("@narada2/control-plane").OperatorActionType,
            ...(targetId ? { target_id: targetId } : {}),
            ...(payloadJson ? { payload_json: payloadJson } : {}),
          },
        );

        if (execResult.status === "executed") {
          scope.coordinatorStore.markConfirmationChallengeConsumed(challenge.challenge_id);
          jsonResponse(res, 200, {
            success: true,
            request_id: execResult.request_id,
            challenge_id: challenge.challenge_id,
            action_type: actionType,
          });
        } else {
          // If execution failed, the challenge is still confirmed but not consumed
          jsonResponse(res, 422, {
            success: false,
            request_id: execResult.request_id,
            challenge_id: challenge.challenge_id,
            reason: execResult.reason,
          });
        }
      },
    },
  ];
}
