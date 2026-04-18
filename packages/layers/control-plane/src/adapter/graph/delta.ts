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
    let url =
      cursor ?? this.client.buildFolderMessagesDeltaUrl(this.userId, this.folderId);

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
