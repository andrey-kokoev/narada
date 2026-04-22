/**
 * Graph Source Factory for Windows Site
 *
 * Builds a live ExchangeSource from WindowsLiveGraphSourceConfig.
 */

import {
  GraphHttpClient,
  ClientCredentialsTokenProvider,
  DefaultGraphAdapter,
  ExchangeSource,
  normalizeFolderRef,
  normalizeFlagged,
} from "@narada2/control-plane";
import type { Source } from "@narada2/control-plane";
import type { WindowsLiveGraphSourceConfig } from "./types.js";

/**
 * Create a live Graph/Exchange source from Windows site config.
 *
 * @throws if required credentials are missing
 */
export function createGraphSource(
  config: WindowsLiveGraphSourceConfig,
  sourceId: string,
): Source {
  if (!config.user_id?.trim()) {
    throw new Error("live_source.user_id is required");
  }
  if (!config.folder_id?.trim()) {
    throw new Error("live_source.folder_id is required");
  }
  if (!config.tenant_id?.trim()) {
    throw new Error("live_source.tenant_id is required");
  }
  if (!config.client_id?.trim()) {
    throw new Error("live_source.client_id is required");
  }
  if (!config.client_secret?.trim()) {
    throw new Error("live_source.client_secret is required");
  }

  const tokenProvider = new ClientCredentialsTokenProvider({
    tenantId: config.tenant_id,
    clientId: config.client_id,
    clientSecret: config.client_secret,
  });

  const client = new GraphHttpClient({
    baseUrl: config.base_url,
    tokenProvider,
    preferImmutableIds: true,
  });

  const adapter = new DefaultGraphAdapter({
    mailbox_id: sourceId,
    user_id: config.user_id,
    client,
    adapter_scope: {
      mailbox_id: sourceId,
      included_container_refs: [config.folder_id],
      included_item_kinds: ["message"],
    },
    body_policy: "text_only",
    attachment_policy: "metadata_only",
    include_headers: false,
    normalize_folder_ref: normalizeFolderRef,
    normalize_flagged: normalizeFlagged,
  });

  return new ExchangeSource({ adapter, sourceId });
}
