import type { GraphDeltaMessage, GraphDeltaPage } from "../../types/graph.js";
import type { GraphTokenProvider } from "./auth.js";

export interface GraphHttpClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  tokenProvider: GraphTokenProvider;
  preferImmutableIds?: boolean;
}

export class GraphHttpClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly tokenProvider: GraphTokenProvider;
  private readonly preferImmutableIds: boolean;

  constructor(opts: GraphHttpClientOptions) {
    this.baseUrl = opts.baseUrl ?? "https://graph.microsoft.com/v1.0";
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.tokenProvider = opts.tokenProvider;
    this.preferImmutableIds = opts.preferImmutableIds ?? true;
  }

  private async requestJson<T>(url: string): Promise<T> {
    const token = await this.tokenProvider.getAccessToken();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };

    if (this.preferImmutableIds) {
      headers.Prefer = 'IdType="ImmutableId"';
    }

    const response = await this.fetchImpl(url, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Graph request failed ${response.status}: ${text.slice(0, 500)}`,
      );
    }

    return (await response.json()) as T;
  }

  buildFolderMessagesDeltaUrl(userId: string, folderId: string): string {
    return `${this.baseUrl}/users/${encodeURIComponent(
      userId,
    )}/mailFolders/${encodeURIComponent(folderId)}/messages/delta`;
  }

  async getDeltaPage(url: string): Promise<GraphDeltaPage<GraphDeltaMessage>> {
    return this.requestJson<GraphDeltaPage<GraphDeltaMessage>>(url);
  }
}
