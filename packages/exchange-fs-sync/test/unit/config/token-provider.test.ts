import { afterEach, describe, expect, it, vi } from "vitest";
import { buildGraphTokenProvider } from "../../../src/config/token-provider.js";
import type { ExchangeFsSyncConfig } from "../../../src/config/types.js";

const baseConfig: ExchangeFsSyncConfig = {
  mailbox_id: "mailbox_primary",
  root_dir: "./data",
  graph: {
    user_id: "user@example.com",
    prefer_immutable_ids: true,
  },
  scope: {
    included_container_refs: ["inbox"],
    included_item_kinds: ["message"],
  },
  normalize: {
    attachment_policy: "metadata_only",
    body_policy: "text_only",
    include_headers: false,
    tombstones_enabled: true,
  },
  runtime: {
    polling_interval_ms: 60_000,
    acquire_lock_timeout_ms: 30_000,
    cleanup_tmp_on_startup: true,
    rebuild_views_after_sync: false,
  },
};

afterEach(() => {
  delete process.env.GRAPH_ACCESS_TOKEN;
  delete process.env.GRAPH_TENANT_ID;
  delete process.env.GRAPH_CLIENT_ID;
  delete process.env.GRAPH_CLIENT_SECRET;
});

describe("buildGraphTokenProvider", () => {
  it("prefers static bearer token from env", async () => {
    process.env.GRAPH_ACCESS_TOKEN = "token-123";

    const provider = buildGraphTokenProvider({
      config: baseConfig,
    });

    await expect(provider.getAccessToken()).resolves.toBe("token-123");
  });

  it("builds client credentials provider from config", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          access_token: "cc-token",
          expires_in: 3600,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });

    const provider = buildGraphTokenProvider({
      config: {
        ...baseConfig,
        graph: {
          ...baseConfig.graph,
          tenant_id: "tenant",
          client_id: "client",
          client_secret: "secret",
        },
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(provider.getAccessToken()).resolves.toBe("cc-token");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws when no auth mechanism is available", () => {
    expect(() =>
      buildGraphTokenProvider({
        config: baseConfig,
      }),
    ).toThrow(/No Graph auth configuration found/);
  });
});