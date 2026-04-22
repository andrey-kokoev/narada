/**
 * Graph Token Provider — Cloudflare-native credential seam
 *
 * Task 367 — Provides access tokens for Microsoft Graph API calls.
 *
 * Cloudflare Workers receive secrets via the `env` object, not `process.env`.
 * These providers are self-contained `fetch()` implementations that do not
 * depend on control-plane Node.js-specific auth code.
 */

export interface GraphTokenProvider {
  /** Resolve an access token for the given scope (user principal name). */
  getToken(scopeId: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// Static bearer token — simplest path; token is bound directly to the Worker
// ---------------------------------------------------------------------------

export class StaticBearerTokenProvider implements GraphTokenProvider {
  constructor(private readonly token: string) {}

  async getToken(): Promise<string> {
    return this.token;
  }
}

// ---------------------------------------------------------------------------
// OAuth 2.0 client credentials — token is fetched from Microsoft identity
// ---------------------------------------------------------------------------

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export class ClientCredentialsTokenProvider implements GraphTokenProvider {
  private cachedToken: string | null = null;
  private cachedExpiry: number = 0;

  constructor(
    private readonly tenantId: string,
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly scope: string = "https://graph.microsoft.com/.default",
  ) {}

  async getToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedExpiry > now + 60_000) {
      return this.cachedToken;
    }

    const url = `https://login.microsoftonline.com/${encodeURIComponent(this.tenantId)}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      scope: this.scope,
      grant_type: "client_credentials",
    });

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw {
        status: response.status,
        code: "TokenRequestFailed",
        message: `OAuth token request failed: ${response.status} ${text}`,
      };
    }

    const data = (await response.json()) as TokenResponse;
    this.cachedToken = data.access_token;
    this.cachedExpiry = now + data.expires_in * 1000;
    return this.cachedToken;
  }

  /** Invalidate the cached token (e.g., after a 401 from Graph). */
  invalidate(): void {
    this.cachedToken = null;
    this.cachedExpiry = 0;
  }
}
