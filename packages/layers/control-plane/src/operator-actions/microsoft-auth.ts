/**
 * Microsoft Entra ID token verification for confirmation challenges.
 *
 * Unit-testable: all network calls are behind interfaces.
 */

export interface MicrosoftTokenClaims {
  tid: string; // tenant id
  aud: string; // audience (client id)
  oid: string; // object id
  sub: string; // subject
  nonce: string;
  exp: number;
  iat: number;
}

export interface TokenExchangeResult {
  access_token: string;
  id_token?: string;
  expires_in?: number;
}

export interface TokenExchangeClient {
  exchangeCode(params: {
    tenantId: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    code: string;
  }): Promise<TokenExchangeResult>;
}

export interface TokenDecoder {
  decodeIdToken(idToken: string): MicrosoftTokenClaims | null;
}

export interface VerifyMicrosoftAuthOptions {
  code: string;
  provider: {
    tenant_id: string;
    client_id: string;
    client_secret: string;
    redirect_base_url: string;
  };
  expectedTenantId: string;
  expectedClientId: string;
  expectedEntraUserId: string;
  expectedNonce?: string;
  tokenExchange: TokenExchangeClient;
  tokenDecoder: TokenDecoder;
}

export interface VerifyMicrosoftAuthResult {
  ok: boolean;
  claims?: MicrosoftTokenClaims;
  error?: string;
}

export async function verifyMicrosoftAuth(
  options: VerifyMicrosoftAuthOptions,
): Promise<VerifyMicrosoftAuthResult> {
  const redirectUri = `${options.provider.redirect_base_url.replace(/\/$/, "")}/control/auth/microsoft/callback`;

  let exchangeResult: TokenExchangeResult;
  try {
    exchangeResult = await options.tokenExchange.exchangeCode({
      tenantId: options.provider.tenant_id,
      clientId: options.provider.client_id,
      clientSecret: options.provider.client_secret,
      redirectUri,
      code: options.code,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `token_exchange_failed: ${message}` };
  }

  const idToken = exchangeResult.id_token;
  if (!idToken) {
    return { ok: false, error: "no_id_token_in_exchange_response" };
  }

  const claims = options.tokenDecoder.decodeIdToken(idToken);
  if (!claims) {
    return { ok: false, error: "invalid_id_token" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (claims.exp < now) {
    return { ok: false, error: "token_expired", claims };
  }

  if (claims.tid !== options.expectedTenantId) {
    return { ok: false, error: `tenant_mismatch: expected ${options.expectedTenantId}, got ${claims.tid}`, claims };
  }

  if (claims.aud !== options.expectedClientId) {
    return { ok: false, error: `audience_mismatch: expected ${options.expectedClientId}, got ${claims.aud}`, claims };
  }

  const objectId = claims.oid || claims.sub;
  if (objectId !== options.expectedEntraUserId) {
    return { ok: false, error: `user_mismatch: expected ${options.expectedEntraUserId}, got ${objectId}`, claims };
  }

  if (options.expectedNonce !== undefined && claims.nonce !== options.expectedNonce) {
    return { ok: false, error: `nonce_mismatch`, claims };
  }

  return { ok: true, claims };
}

/**
 * Simple JWT decoder that does NOT verify the signature.
 * In production, the id_token should be validated with JWKS.
 * This decoder is sufficient for unit tests and for Narada's
 * threat model where the token comes from a direct MS token endpoint exchange.
 */
export const base64UrlJwtDecoder: TokenDecoder = {
  decodeIdToken(idToken: string): MicrosoftTokenClaims | null {
    const parts = idToken.split(".");
    if (parts.length !== 3) return null;
    try {
      const payload = JSON.parse(
        Buffer.from(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
      ) as unknown;
      if (typeof payload !== "object" || payload === null) return null;
      const p = payload as Record<string, unknown>;
      return {
        tid: String(p.tid ?? ""),
        aud: String(p.aud ?? ""),
        oid: String(p.oid ?? ""),
        sub: String(p.sub ?? ""),
        nonce: String(p.nonce ?? ""),
        exp: Number(p.exp ?? 0),
        iat: Number(p.iat ?? 0),
      };
    } catch {
      return null;
    }
  },
};

/**
 * Real Microsoft token exchange using node:http(s).
 * This is the production implementation.
 */
export function createMicrosoftTokenExchangeClient(): TokenExchangeClient {
  return {
    async exchangeCode(params): Promise<TokenExchangeResult> {
      const body = new URLSearchParams({
        client_id: params.clientId,
        client_secret: params.clientSecret,
        grant_type: "authorization_code",
        code: params.code,
        redirect_uri: params.redirectUri,
        scope: "openid profile",
      });

      const url = `https://login.microsoftonline.com/${params.tenantId}/oauth2/v2.0/token`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Microsoft token exchange failed (${response.status}): ${text}`);
      }

      const data = (await response.json()) as Record<string, unknown>;
      return {
        access_token: String(data.access_token ?? ""),
        id_token: typeof data.id_token === "string" ? data.id_token : undefined,
        expires_in: typeof data.expires_in === "number" ? data.expires_in : undefined,
      };
    },
  };
}
