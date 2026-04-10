import type { ExchangeFsSyncConfig } from "./types.js";
import { loadGraphEnv } from "./env.js";
import {
  ClientCredentialsTokenProvider,
  StaticBearerTokenProvider,
  type GraphTokenProvider,
} from "../adapter/graph/auth.js";

export interface BuildGraphTokenProviderOptions {
  config: ExchangeFsSyncConfig;
  fetchImpl?: typeof fetch;
}

export function buildGraphTokenProvider(
  opts: BuildGraphTokenProviderOptions,
): GraphTokenProvider {
  const env = loadGraphEnv();
  const cfg = opts.config;

  if (env.access_token) {
    return new StaticBearerTokenProvider({
      accessToken: env.access_token,
    });
  }

  const tenantId = env.tenant_id ?? cfg.graph.tenant_id;
  const clientId = env.client_id ?? cfg.graph.client_id;
  const clientSecret = env.client_secret ?? cfg.graph.client_secret;

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