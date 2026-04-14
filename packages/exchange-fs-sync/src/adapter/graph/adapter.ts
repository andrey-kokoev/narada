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
import type { RetryConfig } from "../../retry.js";

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
  retryConfig?: Partial<RetryConfig>;
  circuitBreakerThreshold?: number;
}

function resolveFolderCursor(
  compositeCursor: string | null | undefined,
  folderId: string,
): string | null {
  if (!compositeCursor) return null;
  try {
    const parsed = JSON.parse(compositeCursor) as Record<string, unknown>;
    const value = parsed[folderId];
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

function buildCompositeCursor(cursors: Record<string, string>): string {
  return JSON.stringify(cursors);
}

function resolveFirstFolderId(scope: AdapterScope): string {
  const refs = scope.included_container_refs;
  const folderId = refs[0]?.trim();
  if (!folderId) {
    throw new Error("Configured folder ref is empty");
  }
  return folderId;
}

export class DefaultGraphAdapter implements GraphAdapter {
  private readonly cfg: GraphAdapterConfig;
  private readonly deltaWalker?: GraphDeltaWalker;

  constructor(cfg: GraphAdapterConfig) {
    this.cfg = cfg;
    const refs = cfg.adapter_scope.included_container_refs;
    if (refs.length === 1) {
      this.deltaWalker = new GraphDeltaWalker({
        client: cfg.client,
        userId: cfg.user_id,
        folderId: resolveFirstFolderId(cfg.adapter_scope),
      });
    }
  }

  async fetch_since(cursor?: string | null): Promise<NormalizedBatch> {
    const fetchedAt = new Date().toISOString();
    const refs = this.cfg.adapter_scope.included_container_refs;

    if (refs.length === 1 && this.deltaWalker) {
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

    const allMessages: GraphDeltaMessage[] = [];
    const nextCursors: Record<string, string> = {};

    for (const folderId of refs) {
      const trimmedFolderId = folderId.trim();
      if (!trimmedFolderId) {
        throw new Error("Configured folder ref is empty");
      }
      const walker = new GraphDeltaWalker({
        client: this.cfg.client,
        userId: this.cfg.user_id,
        folderId: trimmedFolderId,
      });
      const folderCursor = resolveFolderCursor(cursor, trimmedFolderId);
      const walked = await walker.walkFromCursor(folderCursor);
      allMessages.push(...walked.messages);
      nextCursors[trimmedFolderId] = walked.nextCursor;
    }

    return normalizeBatch({
      mailbox_id: this.cfg.mailbox_id,
      adapter_scope: this.cfg.adapter_scope,
      prior_cursor: cursor ?? null,
      next_cursor: buildCompositeCursor(nextCursors),
      fetched_at: fetchedAt,
      messages: allMessages,
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
