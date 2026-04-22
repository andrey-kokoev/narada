/**
 * Graph Client Factory — Credential Resolution + Fail-Closed Validation
 *
 * Task 367 — Creates a real `GraphDraftClient` from Cloudflare `env` bindings.
 *
 * Resolution precedence:
 * 1. `GRAPH_ACCESS_TOKEN` → StaticBearerTokenProvider
 * 2. `GRAPH_TENANT_ID` + `GRAPH_CLIENT_ID` + `GRAPH_CLIENT_SECRET` → ClientCredentialsTokenProvider
 * 3. Missing → throws before any mutation
 */

import type { CloudflareEnv } from "../coordinator.js";
import type { GraphDraftClient } from "./graph-draft-send-adapter.js";
import {
  StaticBearerTokenProvider,
  ClientCredentialsTokenProvider,
} from "./graph-token-provider.js";
import { FetchGraphDraftClient } from "./fetch-graph-draft-client.js";

export interface GraphClientFactoryOptions {
  baseUrl?: string;
  timeoutMs?: number;
}

/** Thrown when required Graph credentials are missing from env bindings. */
export class GraphCredentialError extends Error {
  readonly status = 401;
  readonly code = "AuthenticationError";

  constructor(message: string) {
    super(message);
    this.name = "GraphCredentialError";
  }
}

export function createGraphDraftClient(
  env: CloudflareEnv,
  options?: GraphClientFactoryOptions,
): GraphDraftClient {
  const tokenProvider = resolveTokenProvider(env);
  return new FetchGraphDraftClient(tokenProvider, {
    baseUrl: options?.baseUrl,
    timeoutMs: options?.timeoutMs,
  });
}

function resolveTokenProvider(env: CloudflareEnv) {
  // Precedence 1: static bearer token
  if (env.GRAPH_ACCESS_TOKEN) {
    return new StaticBearerTokenProvider(env.GRAPH_ACCESS_TOKEN);
  }

  // Precedence 2: OAuth client credentials
  if (env.GRAPH_TENANT_ID && env.GRAPH_CLIENT_ID && env.GRAPH_CLIENT_SECRET) {
    return new ClientCredentialsTokenProvider(
      env.GRAPH_TENANT_ID,
      env.GRAPH_CLIENT_ID,
      env.GRAPH_CLIENT_SECRET,
    );
  }

  // Fail closed
  throw new GraphCredentialError(
    "No Graph credentials bound. Provide GRAPH_ACCESS_TOKEN or GRAPH_TENANT_ID + GRAPH_CLIENT_ID + GRAPH_CLIENT_SECRET.",
  );
}
