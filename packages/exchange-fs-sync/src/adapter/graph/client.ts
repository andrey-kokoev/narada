import type { GraphDeltaMessage, GraphDeltaPage } from "../../types/graph.js";
import type { GraphTokenProvider } from "./auth.js";
import { handleGraphError, withRetry, type RetryConfig } from "../../retry.js";

export interface GraphHttpClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  tokenProvider: GraphTokenProvider;
  preferImmutableIds?: boolean;
  retryConfig?: Partial<RetryConfig>;
}

export class GraphHttpClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly tokenProvider: GraphTokenProvider;
  private readonly preferImmutableIds: boolean;
  private readonly retryConfig?: Partial<RetryConfig>;

  constructor(opts: GraphHttpClientOptions) {
    this.baseUrl = opts.baseUrl ?? "https://graph.microsoft.com/v1.0";
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.tokenProvider = opts.tokenProvider;
    this.preferImmutableIds = opts.preferImmutableIds ?? true;
    this.retryConfig = opts.retryConfig;
  }

  private async requestJson<T>(url: string): Promise<T> {
    const operation = async (): Promise<T> => {
      const token = await this.tokenProvider.getAccessToken();

      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      };

      if (this.preferImmutableIds) {
        headers.Prefer = 'IdType="ImmutableId"';
      }

      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method: "GET",
          headers,
        });
      } catch (networkError) {
        // Network-level errors (DNS, connection refused, etc.)
        throw new Error(
          `Graph network error: ${networkError instanceof Error ? networkError.message : String(networkError)}`,
        );
      }

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        handleGraphError(response.status, text, {
          phase: "fetch",
          operation: "requestJson",
        });
      }

      return (await response.json()) as T;
    };

    // Use retry logic with circuit breaker for Graph API calls
    return withRetry(operation, this.retryConfig, "graph:requestJson", {
      circuitBreaker: undefined, // Could use globalCircuitBreakers.graphApi if desired
    });
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
