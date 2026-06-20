import type { GraphDeltaMessage } from "../../types/graph.js";
import { GraphHttpClient } from "./client.js";

export interface GraphDeltaWalkResult {
  messages: GraphDeltaMessage[];
  nextCursor: string;
}

export interface GraphDeltaWalkerOptions {
  client: GraphHttpClient;
  userId: string;
  folderId: string;
}

export class GraphDeltaWalker {
  private readonly client: GraphHttpClient;
  private readonly userId: string;
  private readonly folderId: string;

  constructor(opts: GraphDeltaWalkerOptions) {
    this.client = opts.client;
    this.userId = opts.userId;
    this.folderId = opts.folderId;
  }

  async walkFromCursor(cursor?: string | null): Promise<GraphDeltaWalkResult> {
    const baseUrl = this.client.buildFolderMessagesDeltaUrl(this.userId, this.folderId);
    try {
      return await this.walkFromUrl(cursor ?? baseUrl);
    } catch (error) {
      if (!cursor || !isStaleDeltaCursorError(error)) throw error;
      return this.walkFromUrl(baseUrl);
    }
  }

  private async walkFromUrl(startUrl: string): Promise<GraphDeltaWalkResult> {
    let url = startUrl;

    const messages: GraphDeltaMessage[] = [];
    let deltaLink: string | undefined;

    while (url) {
      const page = await this.client.getDeltaPage(url);

      messages.push(...page.value);
      deltaLink = page["@odata.deltaLink"];
      url = page["@odata.nextLink"] ?? "";
    }

    if (!deltaLink) {
      throw new Error("Delta query did not return @odata.deltaLink");
    }

    return {
      messages,
      nextCursor: deltaLink,
    };
  }
}

function isStaleDeltaCursorError(error: unknown): boolean {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const metadata = record.metadata && typeof record.metadata === 'object' ? record.metadata as Record<string, unknown> : {};
  const text = [
    error instanceof Error ? error.message : String(error),
    metadata.response,
    metadata.status,
  ].join('\n');
  return /SyncStateNotFound/i.test(text) || /Graph API error \(410\)/.test(text) || /\b410\b/.test(text);
}
