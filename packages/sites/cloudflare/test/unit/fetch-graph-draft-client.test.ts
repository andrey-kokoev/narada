import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createGraphDraftClient,
  GraphCredentialError,
} from "../../src/effects/graph-client-factory.js";
import {
  StaticBearerTokenProvider,
  ClientCredentialsTokenProvider,
} from "../../src/effects/graph-token-provider.js";
import { FetchGraphDraftClient } from "../../src/effects/fetch-graph-draft-client.js";
import type { CloudflareEnv } from "../../src/coordinator.js";

const baseEnv: CloudflareEnv = {
  NARADA_SITE_COORDINATOR: {} as DurableObjectNamespace,
  NARADA_ADMIN_TOKEN: "admin-token",
};

describe("createGraphDraftClient (factory)", () => {
  it("throws GraphCredentialError when no credentials are bound", () => {
    expect(() => createGraphDraftClient(baseEnv)).toThrow(GraphCredentialError);
    expect(() => createGraphDraftClient(baseEnv)).toThrow(
      /No Graph credentials bound/,
    );
  });

  it("throws GraphCredentialError when client credentials are incomplete", () => {
    const env: CloudflareEnv = {
      ...baseEnv,
      GRAPH_TENANT_ID: "tenant-1",
      GRAPH_CLIENT_ID: "client-1",
      // missing GRAPH_CLIENT_SECRET
    };
    expect(() => createGraphDraftClient(env)).toThrow(GraphCredentialError);
  });

  it("creates client with static bearer token when GRAPH_ACCESS_TOKEN is present", () => {
    const env: CloudflareEnv = {
      ...baseEnv,
      GRAPH_ACCESS_TOKEN: "static-token",
    };
    const client = createGraphDraftClient(env);
    expect(client).toBeInstanceOf(FetchGraphDraftClient);
  });

  it("creates client with client credentials when all OAuth fields are present", () => {
    const env: CloudflareEnv = {
      ...baseEnv,
      GRAPH_TENANT_ID: "tenant-1",
      GRAPH_CLIENT_ID: "client-1",
      GRAPH_CLIENT_SECRET: "secret-1",
    };
    const client = createGraphDraftClient(env);
    expect(client).toBeInstanceOf(FetchGraphDraftClient);
  });

  it("prefers static bearer over client credentials when both are present", () => {
    const env: CloudflareEnv = {
      ...baseEnv,
      GRAPH_ACCESS_TOKEN: "static-token",
      GRAPH_TENANT_ID: "tenant-1",
      GRAPH_CLIENT_ID: "client-1",
      GRAPH_CLIENT_SECRET: "secret-1",
    };
    // We can't easily inspect the internal token provider, but we can verify
    // the factory succeeds and returns a FetchGraphDraftClient.
    const client = createGraphDraftClient(env);
    expect(client).toBeInstanceOf(FetchGraphDraftClient);
  });
});

describe("StaticBearerTokenProvider", () => {
  it("returns the bound token", async () => {
    const provider = new StaticBearerTokenProvider("my-token");
    expect(await provider.getToken("any-scope")).toBe("my-token");
  });
});

describe("ClientCredentialsTokenProvider", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches token from Microsoft identity endpoint", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "oauth-token-123",
          expires_in: 3600,
          token_type: "Bearer",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const provider = new ClientCredentialsTokenProvider(
      "tenant-1",
      "client-1",
      "secret-1",
    );
    const token = await provider.getToken("scope-1");

    expect(token).toBe("oauth-token-123");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const call = vi.mocked(global.fetch).mock.calls[0]!;
    expect(call[0]).toBe(
      "https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token",
    );
    expect(call[1]!.method).toBe("POST");
    const body = new URLSearchParams(call[1]!.body as string);
    expect(body.get("client_id")).toBe("client-1");
    expect(body.get("client_secret")).toBe("secret-1");
    expect(body.get("grant_type")).toBe("client_credentials");
  });

  it("caches token and reuses until near expiry", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "cached-token",
          expires_in: 3600,
          token_type: "Bearer",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const provider = new ClientCredentialsTokenProvider(
      "tenant-1",
      "client-1",
      "secret-1",
    );
    const t1 = await provider.getToken("scope-1");
    const t2 = await provider.getToken("scope-1");

    expect(t1).toBe("cached-token");
    expect(t2).toBe("cached-token");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("throws with status 401 when token endpoint returns error", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: "invalid_client", error_description: "Bad secret" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      ),
    );

    const provider = new ClientCredentialsTokenProvider(
      "tenant-1",
      "client-1",
      "secret-1",
    );
    await expect(provider.getToken("scope-1")).rejects.toMatchObject({
      status: 401,
      code: "TokenRequestFailed",
    });
  });
});

describe("FetchGraphDraftClient", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockFetchJson(status: number, body: unknown) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  it("createDraftReply uses Graph createReply endpoint and maps response fields", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchJson(201, {
        id: "draft-abc",
        internetMessageId: "<draft-abc@graph.microsoft.com>",
      }),
    );

    const tokenProvider = new StaticBearerTokenProvider("token-1");
    const client = new FetchGraphDraftClient(tokenProvider, {
      baseUrl: "https://graph.microsoft.com/v1.0",
    });

    const result = await client.createDraftReply(
      "user@example.com",
      "ob-1",
      "parent-msg-1",
      "Hello",
      "Re: Subject",
    );

    expect(result.draftId).toBe("draft-abc");
    expect(result.internetMessageId).toBe("<draft-abc@graph.microsoft.com>");

    const call = vi.mocked(global.fetch).mock.calls[0]!;
    expect(call[0]).toBe(
      "https://graph.microsoft.com/v1.0/users/user%40example.com/messages/parent-msg-1/createReply",
    );
    expect(call[1]!.method).toBe("POST");
    const headers = call[1]!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer token-1");
    expect(headers["x-narada-outbound-id"]).toBe("ob-1");
  });

  it("sendDraft handles Graph 202 empty body gracefully", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(null, { status: 202 }),
    );

    const tokenProvider = new StaticBearerTokenProvider("token-1");
    const client = new FetchGraphDraftClient(tokenProvider);

    const result = await client.sendDraft("user@example.com", "draft-abc");

    // Graph returns 202 Accepted with empty body; sentMessageId is unavailable.
    expect(result.sentMessageId).toBeUndefined();
    expect(result.internetMessageId).toBeUndefined();

    const call = vi.mocked(global.fetch).mock.calls[0]!;
    expect(call[0]).toBe(
      "https://graph.microsoft.com/v1.0/users/user%40example.com/messages/draft-abc/send",
    );
    expect(call[1]!.method).toBe("POST");
  });

  it("sendDraft parses body if Graph ever returns one", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchJson(200, {
        id: "sent-msg-1",
        internetMessageId: "<sent-1@graph.microsoft.com>",
      }),
    );

    const tokenProvider = new StaticBearerTokenProvider("token-1");
    const client = new FetchGraphDraftClient(tokenProvider);

    const result = await client.sendDraft("user@example.com", "draft-abc");

    expect(result.sentMessageId).toBe("sent-msg-1");
    expect(result.internetMessageId).toBe("<sent-1@graph.microsoft.com>");
  });

  it("throws 401 error on Graph auth failure", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchJson(401, {
        error: { code: "AuthenticationError", message: "Token expired" },
      }),
    );

    const tokenProvider = new StaticBearerTokenProvider("bad-token");
    const client = new FetchGraphDraftClient(tokenProvider);

    await expect(
      client.createDraftReply("user@example.com", "ob-1", "parent-1", "body"),
    ).rejects.toMatchObject({
      status: 401,
      code: "AuthenticationError",
      message: "Token expired",
    });
  });

  it("throws 403 error on Graph permission failure", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchJson(403, {
        error: { code: "AccessDenied", message: "No SendAs permission" },
      }),
    );

    const tokenProvider = new StaticBearerTokenProvider("token-1");
    const client = new FetchGraphDraftClient(tokenProvider);

    await expect(
      client.sendDraft("user@example.com", "draft-1"),
    ).rejects.toMatchObject({
      status: 403,
      code: "AccessDenied",
      message: "No SendAs permission",
    });
  });

  it("throws 429 error on Graph rate limit", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      mockFetchJson(429, {
        error: { code: "ErrorRateLimitExceeded", message: "Too many requests" },
      }),
    );

    const tokenProvider = new StaticBearerTokenProvider("token-1");
    const client = new FetchGraphDraftClient(tokenProvider);

    await expect(
      client.createDraftReply("user@example.com", "ob-1", "parent-1", "body"),
    ).rejects.toMatchObject({
      status: 429,
      code: "ErrorRateLimitExceeded",
      message: "Too many requests",
    });
  });

  it("throws TimeoutError on network timeout", async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce(
      new Error("The operation was aborted"),
    );

    const tokenProvider = new StaticBearerTokenProvider("token-1");
    const client = new FetchGraphDraftClient(tokenProvider, { timeoutMs: 100 });

    await expect(
      client.sendDraft("user@example.com", "draft-1"),
    ).rejects.toMatchObject({
      code: "TimeoutError",
      message: expect.stringContaining("timed out"),
    });
  });

  it("throws NetworkError on generic fetch failure", async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce(
      new Error("Network unreachable"),
    );

    const tokenProvider = new StaticBearerTokenProvider("token-1");
    const client = new FetchGraphDraftClient(tokenProvider);

    await expect(
      client.createDraftReply("user@example.com", "ob-1", "parent-1", "body"),
    ).rejects.toMatchObject({
      code: "NetworkError",
      message: "Network unreachable",
    });
  });

  it("parses non-JSON error body gracefully", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response("Internal Server Error", { status: 500 }),
    );

    const tokenProvider = new StaticBearerTokenProvider("token-1");
    const client = new FetchGraphDraftClient(tokenProvider);

    await expect(
      client.sendDraft("user@example.com", "draft-1"),
    ).rejects.toMatchObject({
      status: 500,
      code: "GraphError",
    });
  });
});
