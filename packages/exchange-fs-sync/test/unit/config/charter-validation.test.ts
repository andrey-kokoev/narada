import { describe, expect, it } from "vitest";
import { validateCharterRuntimeConfig } from "../../../src/config/validation.js";
import type { ExchangeFsSyncConfig } from "../../../src/config/types.js";

function makeConfig(overrides?: Partial<ExchangeFsSyncConfig>): ExchangeFsSyncConfig {
  return {
    mailbox_id: "test@example.com",
    root_dir: "./data",
    graph: {
      user_id: "test@example.com",
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
      polling_interval_ms: 60000,
      acquire_lock_timeout_ms: 30000,
      cleanup_tmp_on_startup: true,
      rebuild_views_after_sync: false,
    },
    lifecycle: {
      tombstone_retention_days: 30,
      archive_after_days: 90,
      archive_dir: "archive",
      compress_archives: true,
      retention: {
        preserve_flagged: true,
        preserve_unread: true,
      },
      schedule: {
        frequency: "manual",
        max_run_time_minutes: 60,
      },
    },
    policy: {
      primary_charter: "support_steward",
      allowed_actions: ["no_action"],
    },
    ...overrides,
  } as ExchangeFsSyncConfig;
}

describe("validateCharterRuntimeConfig", () => {
  it("passes for mock runtime without api_key", () => {
    const cfg = makeConfig({ charter: { runtime: "mock" } });
    expect(() => validateCharterRuntimeConfig(cfg)).not.toThrow();
  });

  it("passes for codex-api runtime with api_key in config", () => {
    const cfg = makeConfig({ charter: { runtime: "codex-api", api_key: "sk-test" } });
    expect(() => validateCharterRuntimeConfig(cfg)).not.toThrow();
  });

  it("fails for codex-api runtime without api_key or env var", () => {
    const cfg = makeConfig({ charter: { runtime: "codex-api" } });
    expect(() => validateCharterRuntimeConfig(cfg)).toThrow(
      /Charter runtime is configured as codex-api but no API key is provided/,
    );
  });

  it("fails for unsupported runtime values", () => {
    const cfg = makeConfig({ charter: { runtime: "unsupported" } });
    expect(() => validateCharterRuntimeConfig(cfg)).toThrow(
      /Invalid charter runtime: unsupported\. Expected 'codex-api' or 'mock'/,
    );
  });

  it("defaults to mock and passes when charter is absent", () => {
    const cfg = makeConfig();
    delete (cfg as Partial<ExchangeFsSyncConfig>).charter;
    expect(() => validateCharterRuntimeConfig(cfg)).not.toThrow();
  });
});
