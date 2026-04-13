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

  private async requestJson<T>(
    url: string,
    method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
    body?: unknown,
  ): Promise<T> {
    const operation = async (): Promise<T> => {
      const token = await this.tokenProvider.getAccessToken();

      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      };

      if (this.preferImmutableIds) {
        headers.Prefer = 'IdType="ImmutableId"';
      }

      const init: RequestInit = {
        method,
        headers,
      };

      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
        init.body = JSON.stringify(body);
      }

      let response: Response;
      try {
        response = await this.fetchImpl(url, init);
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

      const text = await response.text().catch(() => "");
      return text ? (JSON.parse(text) as T) : (undefined as T);
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

  /**
   * Perform an authenticated GET request against either an absolute Graph URL
   * or a path relative to the configured base URL.
   */
  async getJson<T>(pathOrUrl: string): Promise<T> {
    const url = pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")
      ? pathOrUrl
      : `${this.baseUrl}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;

    return this.requestJson<T>(url);
  }

  /**
   * Perform an authenticated POST request.
   */
  async postJson<T>(pathOrUrl: string, body: unknown): Promise<T> {
    const url = pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")
      ? pathOrUrl
      : `${this.baseUrl}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;
    return this.requestJson<T>(url, "POST", body);
  }

  /**
   * Perform an authenticated PATCH request.
   */
  async patchJson<T>(pathOrUrl: string, body: unknown): Promise<T> {
    const url = pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")
      ? pathOrUrl
      : `${this.baseUrl}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;
    return this.requestJson<T>(url, "PATCH", body);
  }

  /**
   * Perform an authenticated DELETE request.
   */
  async delete(pathOrUrl: string): Promise<void> {
    const url = pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")
      ? pathOrUrl
      : `${this.baseUrl}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;
    await this.requestJson<unknown>(url, "DELETE");
  }

  /**
   * Get the token provider for making authenticated requests
   */
  getTokenProvider(): GraphTokenProvider {
    return this.tokenProvider;
  }
}
