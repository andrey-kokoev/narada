/**
 * Shared token provider for multi-mailbox sync
 * 
 * Deduplicates concurrent token refresh requests and shares tokens
 * across mailboxes with the same credentials.
 */

import type { GraphTokenProvider } from "./auth.js";
import type { TokenProviderConfig } from "../../config/multi-mailbox.js";

/** Token with metadata */
interface Token {
  accessToken: string;
  expiresAt: number;
  credentialKey: string;
}

/** Shared token provider that caches and deduplicates token requests */
export class SharedTokenProvider implements GraphTokenProvider {
  private readonly cache: Map<string, Token>;
  private readonly refreshPromises: Map<string, Promise<Token>>;
  private readonly fetchImpl: typeof fetch;

  constructor(fetchImpl: typeof fetch = globalThis.fetch) {
    this.cache = new Map();
    this.refreshPromises = new Map();
    this.fetchImpl = fetchImpl;
  }

  /**
   * Get a token for the given credentials
   * Deduplicates concurrent refresh requests for the same credentials
   */
  async getToken(credentials: TokenProviderConfig): Promise<Token> {
    const key = this.buildCredentialKey(credentials);

    // Check cache first
    const cached = this.cache.get(key);
    if (cached && this.isTokenValid(cached)) {
      return cached;
    }

    // Check for in-flight refresh
    const inFlight = this.refreshPromises.get(key);
    if (inFlight) {
      return inFlight;
    }

    // Start new refresh
    const refreshPromise = this.fetchToken(credentials, key);
    this.refreshPromises.set(key, refreshPromise);

    try {
      const token = await refreshPromise;
      this.cache.set(key, token);
      return token;
    } finally {
      this.refreshPromises.delete(key);
    }
  }

  /**
   * Get access token string (implements GraphTokenProvider interface)
   * This method creates a temporary provider for a single set of credentials
   * For multi-mailbox use, prefer getToken() with explicit credentials
   */
  async getAccessToken(): Promise<string> {
    throw new Error(
      "SharedTokenProvider requires credentials. Use getToken(credentials) instead of getAccessToken().",
    );
  }

  /**
   * Create a GraphTokenProvider for specific credentials
   * Returns a provider that uses the shared cache
   */
  createProvider(credentials: TokenProviderConfig): GraphTokenProvider {
    return {
      getAccessToken: async () => {
        const token = await this.getToken(credentials);
        return token.accessToken;
      },
      invalidateAccessToken: () => {
        this.invalidateCredentials(credentials);
      },
    };
  }

  /**
   * Check if a cached token is still valid
   * Includes 60-second buffer before expiration
   */
  private isTokenValid(token: Token): boolean {
    const bufferMs = 60_000; // 60 second buffer
    return Date.now() < token.expiresAt - bufferMs;
  }

  /**
   * Fetch a new token from the OAuth endpoint
   */
  private async fetchToken(
    credentials: TokenProviderConfig,
    key: string,
  ): Promise<Token> {
    const tokenEndpoint = `https://login.microsoftonline.com/${encodeURIComponent(
      credentials.tenant_id,
    )}/oauth2/v2.0/token`;

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
      scope: credentials.scope ?? "https://graph.microsoft.com/.default",
    });

    const response = await this.fetchImpl(tokenEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Token request failed ${response.status}: ${text.slice(0, 500)}`,
      );
    }

    const json = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      token_type?: string;
    };

    const accessToken = json.access_token?.trim();

    if (!accessToken) {
      throw new Error("Token response missing access_token");
    }

    const expiresInSec =
      typeof json.expires_in === "number" && Number.isFinite(json.expires_in)
        ? json.expires_in
        : 3600;

    return {
      accessToken,
      expiresAt: Date.now() + expiresInSec * 1000,
      credentialKey: key,
    };
  }

  /**
   * Build a unique key for a set of credentials
   */
  private buildCredentialKey(credentials: TokenProviderConfig): string {
    return [
      credentials.tenant_id,
      credentials.client_id,
      credentials.scope ?? "default",
    ].join(":");
  }

  /**
   * Clear the token cache
   */
  clearCache(): void {
    this.cache.clear();
    this.refreshPromises.clear();
  }

  /**
   * Remove a specific credential from the cache
   */
  invalidateCredentials(credentials: TokenProviderConfig): void {
    const key = this.buildCredentialKey(credentials);
    this.cache.delete(key);
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    cachedTokens: number;
    inFlightRefreshes: number;
    credentialKeys: string[];
  } {
    return {
      cachedTokens: this.cache.size,
      inFlightRefreshes: this.refreshPromises.size,
      credentialKeys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Check if credentials are cached
   */
  hasCachedToken(credentials: TokenProviderConfig): boolean {
    const key = this.buildCredentialKey(credentials);
    const token = this.cache.get(key);
    return token !== undefined && this.isTokenValid(token);
  }
}

/** Global shared token provider instance */
let globalSharedTokenProvider: SharedTokenProvider | undefined;

/**
 * Get or create the global shared token provider
 */
export function getGlobalSharedTokenProvider(fetchImpl?: typeof fetch): SharedTokenProvider {
  if (!globalSharedTokenProvider) {
    globalSharedTokenProvider = new SharedTokenProvider(fetchImpl);
  }
  return globalSharedTokenProvider;
}

/**
 * Reset the global shared token provider (for testing)
 */
export function resetGlobalSharedTokenProvider(): void {
  globalSharedTokenProvider = undefined;
}
