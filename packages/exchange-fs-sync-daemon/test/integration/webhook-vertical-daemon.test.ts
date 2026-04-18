import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Database,
  InMemoryWebhookEventQueue,
  WebhookSource,
  FileCursorStore,
  FileApplyLogStore,
  SqliteFactStore,
  DefaultSyncRunner,
} from "@narada2/exchange-fs-sync";
import { createGenericWebhookServer } from "../../src/generic-webhook-server.js";
import type { GenericWebhookServer } from "../../src/generic-webhook-server.js";

describe("daemon webhook vertical integration", () => {
  let queue: InMemoryWebhookEventQueue;
  let server: GenericWebhookServer;
  let rootDir: string;

  beforeEach(async () => {
    queue = new InMemoryWebhookEventQueue();
    server = createGenericWebhookServer({ port: 0, path: "/webhook" }, queue);
    rootDir = await mkdtemp(join(tmpdir(), "efs-daemon-webhook-"));
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
    await rm(rootDir, { recursive: true, force: true });
  });

  it(
    "should receive a generic webhook and make it pullable via WebhookSource",
    async () => {
      const url = server.getUrl();
      expect(url).not.toBeNull();

      const payload = { alert: "cpu_high", severity: "critical" };
      const response = await fetch(`${url}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Webhook-Endpoint": "monitoring" },
        body: JSON.stringify(payload),
      });

      expect(response.status).toBe(202);
      const json = (await response.json()) as { received: boolean; record_id: string };
      expect(json.received).toBe(true);
      expect(json.record_id).toMatch(/^webhook:monitoring:/);

      // Verify the source can pull it
      const source = new WebhookSource({ sourceId: "daemon-test", queue });
      const batch = await source.pull(null);
      expect(batch.records).toHaveLength(1);
      expect(batch.records[0]!.recordId).toBe(json.record_id);

      // Run it through the sync runner to prove fact ingestion works end-to-end
      const cursorStore = new FileCursorStore({ rootDir, scopeId: "daemon-test" });
      const applyLogStore = new FileApplyLogStore({ rootDir });
      const factDb = new Database(join(rootDir, "facts.db"));
      const factStore = new SqliteFactStore({ db: factDb });
      factStore.initSchema();

      const runner = new DefaultSyncRunner({
        rootDir,
        source,
        cursorStore,
        applyLogStore,
        factStore,
        projector: {
          applyRecord: async () => ({
            event_id: "evt_test",
            message_id: "msg_test",
            applied: true,
            dirty_views: { by_thread: [], by_folder: [], unread_changed: false, flagged_changed: false },
          }),
        },
      });

      const result = await runner.syncOnce();
      expect(result.status).toBe("success");
      expect(result.applied_count).toBe(1);

      const facts = factStore.getUnadmittedFacts("daemon-test");
      expect(facts.length).toBe(1);
      expect(facts[0]!.fact_type).toBe("webhook.received");

      factDb.close();
    },
    15000,
  );
});
