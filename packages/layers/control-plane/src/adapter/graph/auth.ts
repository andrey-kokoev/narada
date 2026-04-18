export interface GraphTokenProvider {
  getAccessToken(): Promise<string>;
}

export interface StaticBearerTokenProviderOptions {
  accessToken: string | (() => string | Promise<string>);
}

export class StaticBearerTokenProvider implements GraphTokenProvider {
  private readonly accessToken: string | (() => string | Promise<string>);

  constructor(opts: StaticBearerTokenProviderOptions) {
    this.accessToken = opts.accessToken;
  }

  async getAccessToken(): Promise<string> {
    const value =
      typeof this.accessToken === "function"
        ? await this.accessToken()
        : this.accessToken;

    const trimmed = value.trim();

    if (!trimmed) {
      throw new Error("Graph access token is empty");
    }

    return trimmed;
  }
}

export interface ClientCredentialsTokenProviderOptions {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
  scope?: string;
}

interface CachedToken {
  accessToken: string;
  expiresAtEpochMs: number;
}

export class ClientCredentialsTokenProvider implements GraphTokenProvider {
  private readonly tenantId: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly fetchImpl: typeof fetch;
  private readonly scope: string;
  private cached?: CachedToken;

  constructor(opts: ClientCredentialsTokenProviderOptions) {
    this.tenantId = opts.tenantId;
    this.clientId = opts.clientId;
    this.clientSecret = opts.clientSecret;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.scope = opts.scope ?? "https://graph.microsoft.com/.default";
  }

  private tokenEndpoint(): string {
    return `https://login.microsoftonline.com/${encodeURIComponent(
      this.tenantId,
    )}/oauth2/v2.0/token`;
  }

  private isCacheUsable(): boolean {
    if (!this.cached) {
      return false;
    }

    const now = Date.now();
    const refreshSkewMs = 60_000;

    return this.cached.expiresAtEpochMs - refreshSkewMs > now;
  }

  async getAccessToken(): Promise<string> {
    if (this.isCacheUsable()) {
      return this.cached!.accessToken;
    }

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.clientId,
      client_secret: this.clientSecret,
      scope: this.scope,
    });

    const response = await this.fetchImpl(this.tokenEndpoint(), {
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

    this.cached = {
      accessToken,
      expiresAtEpochMs: Date.now() + expiresInSec * 1000,
    };

    return accessToken;
  }
}
