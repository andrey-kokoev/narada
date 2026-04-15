import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadMultiMailboxConfig, validateMailboxConfig } from "../../../src/config/multi-mailbox.js";

async function writeConfigFile(value: unknown): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "exchange-fs-sync-multi-"));
  const path = join(dir, "config.json");
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return path;
}

async function cleanupConfigFile(path: string): Promise<void> {
  await rm(join(path, ".."), { recursive: true, force: true });
}

describe("loadMultiMailboxConfig", () => {
  let createdPaths: string[] = [];

  afterEach(async () => {
    await Promise.all(createdPaths.map((path) => cleanupConfigFile(path)));
    createdPaths = [];
  });

  it("loads a valid multi-mailbox config with defaults", async () => {
    const path = await writeConfigFile({
      mailboxes: [
        {
          id: "mb-1",
          mailbox_id: "user1@example.com",
          root_dir: "./data/mb1",
          graph: {
            user_id: "user1@example.com",
            prefer_immutable_ids: true,
          },
        },
      ],
    });
    createdPaths.push(path);

    const result = await loadMultiMailboxConfig({ path });
    expect(result.valid).toBe(true);
    expect(result.config.mailboxes).toHaveLength(1);
    expect(result.config.mailboxes[0]!.charter?.runtime).toBe("mock");
    expect(result.config.mailboxes[0]!.policy?.primary_charter).toBe("support_steward");
    expect(result.config.mailboxes[0]!.policy?.allowed_actions).toEqual([
      "draft_reply",
      "send_reply",
      "mark_read",
      "no_action",
    ]);
    expect(result.config.mailboxes[0]!.lifecycle?.tombstone_retention_days).toBe(30);
  });

  it("loads charter, policy, lifecycle, and webhook per mailbox", async () => {
    const path = await writeConfigFile({
      mailboxes: [
        {
          id: "mb-1",
          mailbox_id: "user1@example.com",
          root_dir: "./data/mb1",
          graph: {
            user_id: "user1@example.com",
            prefer_immutable_ids: true,
          },
          charter: {
            runtime: "codex-api",
            api_key: "sk-test",
            model: "gpt-4",
          },
          policy: {
            primary_charter: "obligation_keeper",
            secondary_charters: ["support_steward"],
            allowed_actions: ["send_reply", "no_action"],
            allowed_tools: ["echo_test"],
            require_human_approval: true,
          },
          lifecycle: {
            tombstone_retention_days: 7,
            archive_after_days: 30,
            archive_dir: "old",
            compress_archives: false,
            retention: {
              preserve_flagged: false,
              max_age_days: 90,
            },
            schedule: {
              frequency: "daily",
              max_run_time_minutes: 30,
            },
          },
          webhook: {
            enabled: true,
            public_url: "https://example.com/webhook",
            port: 3000,
            client_state: "secret",
          },
        },
      ],
    });
    createdPaths.push(path);

    const result = await loadMultiMailboxConfig({ path });
    expect(result.valid).toBe(true);
    const mb = result.config.mailboxes[0]!;
    expect(mb.charter).toEqual({
      runtime: "codex-api",
      api_key: "sk-test",
      model: "gpt-4",
    });
    expect(mb.policy).toEqual({
      primary_charter: "obligation_keeper",
      secondary_charters: ["support_steward"],
      allowed_actions: ["send_reply", "no_action"],
      allowed_tools: ["echo_test"],
      require_human_approval: true,
    });
    expect(mb.lifecycle?.tombstone_retention_days).toBe(7);
    expect(mb.lifecycle?.archive_dir).toBe("old");
    expect(mb.lifecycle?.retention.preserve_flagged).toBe(false);
    expect(mb.lifecycle?.retention.max_age_days).toBe(90);
    expect(mb.lifecycle?.schedule.frequency).toBe("daily");
    expect(mb.webhook).toEqual({
      enabled: true,
      public_url: "https://example.com/webhook",
      port: 3000,
      client_state: "secret",
    });
  });

  it("rejects invalid policy allowed_actions", async () => {
    const path = await writeConfigFile({
      mailboxes: [
        {
          id: "mb-1",
          mailbox_id: "user1@example.com",
          root_dir: "./data/mb1",
          graph: {
            user_id: "user1@example.com",
            prefer_immutable_ids: true,
          },
          policy: {
            allowed_actions: ["invalid_action"],
          },
        },
      ],
    });
    createdPaths.push(path);

    const result = await loadMultiMailboxConfig({ path });
    expect(result.valid).toBe(false);
    expect(result.validationErrors.get("mailbox[0]")?.some((e) => e.includes("allowed_actions"))).toBe(true);
  });

  it("rejects enabled webhook missing required fields", async () => {
    const path = await writeConfigFile({
      mailboxes: [
        {
          id: "mb-1",
          mailbox_id: "user1@example.com",
          root_dir: "./data/mb1",
          graph: {
            user_id: "user1@example.com",
            prefer_immutable_ids: true,
          },
          webhook: {
            enabled: true,
          },
        },
      ],
    });
    createdPaths.push(path);

    const result = await loadMultiMailboxConfig({ path });
    expect(result.valid).toBe(false);
    expect(result.validationErrors.get("mailbox[0]")?.some((e) => e.includes("webhook.public_url"))).toBe(true);
  });

  it("rejects duplicate mailbox ids", async () => {
    const path = await writeConfigFile({
      mailboxes: [
        {
          id: "mb-1",
          mailbox_id: "user1@example.com",
          root_dir: "./data/mb1",
          graph: { user_id: "user1@example.com", prefer_immutable_ids: true },
        },
        {
          id: "mb-1",
          mailbox_id: "user2@example.com",
          root_dir: "./data/mb2",
          graph: { user_id: "user2@example.com", prefer_immutable_ids: true },
        },
      ],
    });
    createdPaths.push(path);

    const result = await loadMultiMailboxConfig({ path });
    expect(result.valid).toBe(false);
    expect(result.validationErrors.get("mb-1")?.[0]).toMatch(/Duplicate mailbox ID/);
  });
});

describe("validateMailboxConfig", () => {
  it("returns defaults for missing optional fields", () => {
    const result = validateMailboxConfig(
      {
        id: "mb-1",
        mailbox_id: "user@example.com",
        root_dir: "./data",
        graph: { user_id: "user@example.com", prefer_immutable_ids: true },
      },
      0,
    );
    expect(result.valid).toBe(true);
    expect(result.config!.sync?.attachment_policy).toBe("metadata_only");
    expect(result.config!.lifecycle?.archive_after_days).toBe(90);
  });
});
