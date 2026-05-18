import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export interface GraphTokenProvider {
  getAccessToken(): Promise<string>;
  /** Invalidate any cached token so the next call fetches a fresh one. */
  invalidateAccessToken?(): void;
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

  invalidateAccessToken(): void {
    // No cache to invalidate
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

  invalidateAccessToken(): void {
    this.cached = undefined;
  }
}

export interface AzureCliTokenProviderOptions {
  tenantId?: string;
  timeoutMs?: number;
  execFileImpl?: typeof execFile;
}

export class AzureCliTokenProvider implements GraphTokenProvider {
  private readonly tenantId?: string;
  private readonly timeoutMs: number;
  private readonly execFileImpl: typeof execFile;
  private cached?: CachedToken;

  constructor(opts: AzureCliTokenProviderOptions = {}) {
    this.tenantId = opts.tenantId;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.execFileImpl = opts.execFileImpl ?? execFile;
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

    const args = [
      "account",
      "get-access-token",
      "--resource",
      "https://graph.microsoft.com",
      "--output",
      "json",
    ];

    if (this.tenantId) {
      args.push("--tenant", this.tenantId);
    }

    let stdout: string;
    try {
      const result = await this.execFileImpl(azureCliCommand(), args, {
        timeout: this.timeoutMs,
        shell: process.platform === "win32",
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      });
      stdout = result.stdout;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Graph delegated Microsoft login unavailable: Azure CLI could not issue a Graph token. Run az login${this.tenantId ? ` --tenant ${this.tenantId}` : ""} or repair Azure CLI login state. Detail: ${detail}`,
      );
    }

    let json: { accessToken?: string; expiresOn?: string; expires_on?: number };
    try {
      json = JSON.parse(stdout) as { accessToken?: string; expiresOn?: string; expires_on?: number };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Graph delegated Microsoft login unavailable: Azure CLI returned invalid token JSON. Detail: ${detail}`);
    }

    const accessToken = json.accessToken?.trim();
    if (!accessToken) {
      throw new Error("Graph delegated Microsoft login unavailable: Azure CLI token response missing accessToken");
    }

    this.cached = {
      accessToken,
      expiresAtEpochMs: parseAzureCliExpiry(json) ?? Date.now() + 3600 * 1000,
    };

    return accessToken;
  }

  invalidateAccessToken(): void {
    this.cached = undefined;
  }
}

function azureCliCommand(): string {
  return "az";
}

function parseAzureCliExpiry(json: { expiresOn?: string; expires_on?: number }): number | undefined {
  if (typeof json.expires_on === "number" && Number.isFinite(json.expires_on)) {
    return json.expires_on * 1000;
  }

  if (json.expiresOn) {
    const parsed = Date.parse(json.expiresOn);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}
