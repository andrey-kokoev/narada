import type { ExchangeFsSyncConfig, ScopeConfig } from "./types.js";
import { loadGraphEnv } from "./env.js";
import {
  ClientCredentialsTokenProvider,
  StaticBearerTokenProvider,
  type GraphTokenProvider,
} from "../adapter/graph/auth.js";

export interface BuildGraphTokenProviderOptions {
  /** @deprecated Pass graph directly instead of full config. */
  config?: ExchangeFsSyncConfig;
  graph?: ScopeConfig["graph"];
  fetchImpl?: typeof fetch;
}

export function buildGraphTokenProvider(
  opts: BuildGraphTokenProviderOptions,
): GraphTokenProvider {
  const env = loadGraphEnv();
  const graph = opts.graph ?? opts.config?.graph;

  if (!graph) {
    throw new Error(
      "No Graph auth configuration found. Provide graph config or ExchangeFsSyncConfig with graph field.",
    );
  }

  if (env.access_token) {
    return new StaticBearerTokenProvider({
      accessToken: env.access_token,
    });
  }

  const tenantId = env.tenant_id ?? graph.tenant_id;
  const clientId = env.client_id ?? graph.client_id;
  const clientSecret = env.client_secret ?? graph.client_secret;

  if (tenantId && clientId && clientSecret) {
    return new ClientCredentialsTokenProvider({
      tenantId,
      clientId,
      clientSecret,
      fetchImpl: opts.fetchImpl,
    });
  }

  throw new Error(
    "No Graph auth configuration found. Provide GRAPH_ACCESS_TOKEN or tenant/client/client_secret via env or config.",
  );
}