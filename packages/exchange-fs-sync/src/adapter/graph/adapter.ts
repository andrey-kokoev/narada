import type { GraphDeltaMessage } from "../../types/graph.js";
import type {
  AdapterScope,
  AttachmentPolicy,
  BodyPolicy,
  NormalizedBatch,
} from "../../types/normalized.js";
import type { GraphAdapter } from "../../types/runtime.js";
import { normalizeBatch } from "../../normalize/batch.js";
import { GraphHttpClient } from "./client.js";
import { GraphDeltaWalker } from "./delta.js";

export interface GraphAdapterConfig {
  mailbox_id: string;
  user_id: string;
  client: GraphHttpClient;
  adapter_scope: AdapterScope;
  body_policy: BodyPolicy;
  attachment_policy: AttachmentPolicy;
  include_headers: boolean;
  normalize_folder_ref: (graph_message: GraphDeltaMessage) => string[];
  normalize_flagged: (flag: GraphDeltaMessage["flag"]) => boolean;
  classify_removed_as_delete?: (message: GraphDeltaMessage) => boolean;
}

function resolveSingleFolderScope(scope: AdapterScope): string {
  const refs = scope.included_container_refs;

  if (refs.length !== 1) {
    throw new Error(
      `Exactly one included_container_ref is required for current folder-scoped delta implementation; got ${refs.length}`,
    );
  }

  const folderId = refs[0]?.trim();

  if (!folderId) {
    throw new Error("Configured folder ref is empty");
  }

  return folderId;
}

export class DefaultGraphAdapter implements GraphAdapter {
  private readonly cfg: GraphAdapterConfig;
  private readonly deltaWalker: GraphDeltaWalker;

  constructor(cfg: GraphAdapterConfig) {
    this.cfg = cfg;
    this.deltaWalker = new GraphDeltaWalker({
      client: cfg.client,
      userId: cfg.user_id,
      folderId: resolveSingleFolderScope(cfg.adapter_scope),
    });
  }

  async fetch_since(cursor?: string | null): Promise<NormalizedBatch> {
    const fetchedAt = new Date().toISOString();
    const walked = await this.deltaWalker.walkFromCursor(cursor);

    return normalizeBatch({
      mailbox_id: this.cfg.mailbox_id,
      adapter_scope: this.cfg.adapter_scope,
      prior_cursor: cursor ?? null,
      next_cursor: walked.nextCursor,
      fetched_at: fetchedAt,
      messages: walked.messages,
      has_more: false,
      body_policy: this.cfg.body_policy,
      attachment_policy: this.cfg.attachment_policy,
      include_headers: this.cfg.include_headers,
      normalize_folder_ref: this.cfg.normalize_folder_ref,
      normalize_flagged: this.cfg.normalize_flagged,
      classify_removed_as_delete: this.cfg.classify_removed_as_delete,
    });
  }
}
