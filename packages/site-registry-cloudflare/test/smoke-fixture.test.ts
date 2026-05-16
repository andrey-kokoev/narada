import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import worker, { type SiteRegistryCloudflareEnv } from "../src/index.js";

const relationFixture = JSON.parse(
  readFileSync(new URL("../fixtures/relation-lifecycle-smoke.v0.json", import.meta.url), "utf8"),
) as {
  site_event: Record<string, unknown>;
  active_relation: Record<string, unknown>;
  site_withdrawal: Record<string, unknown>;
  registry_suppression: Record<string, unknown>;
  invalid_transition: Record<string, unknown>;
  expected_public_summaries: {
    before_withdrawal: { site_count: number; fresh_count: number; missing_count: number };
    after_withdrawal: { site_count: number; fresh_count: number; missing_count: number };
  };
  live_safety: { default_live_mode: string; mutation_gate_env: string; mutation_gate_required_value: string };
};

class SmokeKv {
  readonly values = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }
  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

class SmokeD1 {
  readonly messages = new Map<string, Record<string, unknown>>();
  readonly relations = new Map<string, Record<string, unknown>>();
  readonly relationEvents: Record<string, unknown>[] = [];
  prepare(sql: string) {
    return {
      bind: (...values: unknown[]) => ({
        run: async () => {
          if (sql.includes("insert into site_registry_relations")) {
            const [relation_id, registry_id, site_id, subject_site_id, relation_kind, state, visibility, created_at, updated_at, retired_at, withdrawn_at, suppressed_at, evidence_event_id, relation_json] = values;
            const existing = this.relations.get(String(relation_id));
            this.relations.set(String(relation_id), {
              ...(existing ?? {}),
              relation_id,
              registry_id,
              site_id,
              subject_site_id,
              relation_kind,
              state,
              visibility,
              created_at: existing?.created_at ?? created_at,
              updated_at,
              retired_at,
              withdrawn_at,
              suppressed_at,
              evidence_event_id,
              relation_json,
            });
          }
          if (sql.includes("insert into site_registry_relation_events")) {
            const [event_id, relation_id, registry_id, site_id, relation_kind, transition, from_state, to_state, from_visibility, to_visibility, actor_site_id, actor_kind, capability_ref, idempotency_key, occurred_at, event_json] = values;
            this.relationEvents.push({
              event_id,
              relation_id,
              registry_id,
              site_id,
              relation_kind,
              transition,
              from_state,
              to_state,
              from_visibility,
              to_visibility,
              actor_site_id,
              actor_kind,
              capability_ref,
              idempotency_key,
              occurred_at,
              event_json,
            });
          }
          if (sql.includes("insert into site_registry_remote_messages")) {
            const [message_id, source_ref, idempotency_key, target_site_id, status, retry_count, received_at, message_json, receipt_json] = values;
            this.messages.set(String(message_id), { message_id, source_ref, idempotency_key, target_site_id, status, retry_count, received_at, message_json, receipt_json });
          }
          if (sql.includes("update site_registry_remote_messages set status")) {
            const [status, message_json, receipt_json, messageId] = values;
            const row = this.messages.get(String(messageId));
            if (row) Object.assign(row, { status, message_json, receipt_json });
          }
          return { success: true };
        },
        first: async () => {
          if (sql.includes("select relation_json from site_registry_relations where relation_id = ?")) {
            const row = this.relations.get(String(values[0]));
            return row ? { relation_json: row.relation_json } : null;
          }
          if (sql.includes("select event_json from site_registry_relation_events where relation_id = ? and idempotency_key = ?")) {
            const row = this.relationEvents.find((candidate) =>
              candidate.relation_id === values[0] && candidate.idempotency_key === values[1]);
            return row ? { event_json: row.event_json } : null;
          }
          if (sql.includes("where message_id = ?")) {
            const row = this.messages.get(String(values[0]));
            return row ? { message_json: row.message_json } : null;
          }
          if (sql.includes("where source_ref = ? and idempotency_key = ?")) {
            const row = [...this.messages.values()].find((candidate) => candidate.source_ref === values[0] && candidate.idempotency_key === values[1]);
            return row ? { message_json: row.message_json } : null;
          }
          return null;
        },
        all: async () => {
          if (sql.includes("select relation_json from site_registry_relations where relation_kind = ?")) {
            return {
              results: [...this.relations.values()]
                .filter((row) => row.relation_kind === values[0])
                .map((row) => ({ relation_json: row.relation_json })),
            };
          }
          if (sql.includes("select event_json from site_registry_relation_events where relation_id = ?")) {
            return {
              results: this.relationEvents
                .filter((row) => row.relation_id === values[0])
                .map((row) => ({ event_json: row.event_json })),
            };
          }
          return {
            results: [...this.messages.values()]
              .filter((row) => row.status === values[0])
              .map((row) => ({ message_json: row.message_json })),
          };
        },
      }),
    };
  }
}

function env(): SiteRegistryCloudflareEnv {
  return {
    NARADA_SITE_REGISTRY_KV: new SmokeKv() as unknown as KVNamespace,
    NARADA_SITE_REGISTRY_D1: new SmokeD1() as unknown as D1Database,
    NARADA_SITE_REGISTRY_READ_TOKEN: "read-token",
    NARADA_SITE_REGISTRY_PUBLISH_TOKEN: "publish-token",
    NARADA_SITE_REGISTRY_MESSAGE_TOKEN: "message-token",
    NARADA_SITE_REGISTRY_POLL_TOKEN: "poll-token",
    NARADA_SITE_REGISTRY_LOCAL_ADMISSION_TOKEN: "finalize-token",
    NARADA_SITE_REGISTRY_RELATION_WITHDRAW_TOKEN: "withdraw-token",
    NARADA_SITE_REGISTRY_RELATION_ADMIN_TOKEN: "relation-admin-token",
    NARADA_SITE_REGISTRY_KNOWN_SITE_IDS: "site-a",
  };
}

describe("hosted Site Registry non-live smoke fixture", () => {
  it("proves relation lifecycle withdrawal filtering without deleting projection evidence", async () => {
    const runtime = env();
    const d1 = runtime.NARADA_SITE_REGISTRY_D1 as unknown as SmokeD1;
    expect(relationFixture.live_safety).toMatchObject({
      default_live_mode: "route_shape_and_refusal_only",
      mutation_gate_env: "NARADA_SITE_REGISTRY_LIVE_RELATION_MUTATION",
      mutation_gate_required_value: "1",
    });

    const eventResponse = await worker.fetch(new Request("https://registry.example/webhook", {
      method: "POST",
      headers: { authorization: "Bearer publish-token" },
      body: JSON.stringify(relationFixture.site_event),
    }), runtime);
    expect(eventResponse.status).toBe(202);

    const activation = await worker.fetch(new Request("https://registry.example/api/relations/transition", {
      method: "POST",
      headers: { authorization: "Bearer relation-admin-token" },
      body: JSON.stringify(relationFixture.active_relation),
    }), runtime);
    expect(activation.status).toBe(202);

    const before = await worker.fetch(new Request("https://registry.example/api/sites"), runtime);
    const beforeBody = await before.json() as { summary: { site_count: number; fresh_count: number; missing_count: number } };
    expect(beforeBody.summary).toMatchObject(relationFixture.expected_public_summaries.before_withdrawal);

    const withdrawal = await worker.fetch(new Request("https://registry.example/api/relations/transition", {
      method: "POST",
      headers: { authorization: "Bearer withdraw-token" },
      body: JSON.stringify(relationFixture.site_withdrawal),
    }), runtime);
    expect(withdrawal.status).toBe(202);

    const after = await worker.fetch(new Request("https://registry.example/api/sites"), runtime);
    const afterBody = await after.json() as { summary: { site_count: number; fresh_count: number; missing_count: number }; sites: unknown[] };
    expect(afterBody.summary).toMatchObject(relationFixture.expected_public_summaries.after_withdrawal);
    expect(afterBody.sites).toEqual([]);

    const retainedProjection = await worker.fetch(new Request("https://registry.example/api/projections/site-a", {
      headers: { authorization: "Bearer read-token" },
    }), runtime);
    expect(retainedProjection.status).toBe(200);
    expect(d1.relationEvents).toHaveLength(2);
  });

  it("covers suppression, invalid transition refusal, and unauthorized transition refusal from fixtures", async () => {
    const runtime = env();
    const d1 = runtime.NARADA_SITE_REGISTRY_D1 as unknown as SmokeD1;

    const suppression = await worker.fetch(new Request("https://registry.example/api/relations/transition", {
      method: "POST",
      headers: { authorization: "Bearer relation-admin-token" },
      body: JSON.stringify(relationFixture.registry_suppression),
    }), runtime);
    expect(suppression.status).toBe(202);

    const invalid = await worker.fetch(new Request("https://registry.example/api/relations/transition", {
      method: "POST",
      headers: { authorization: "Bearer relation-admin-token" },
      body: JSON.stringify(relationFixture.invalid_transition),
    }), runtime);
    const invalidBody = await invalid.json() as { refusal_reasons: string[] };
    expect(invalid.status).toBe(400);
    expect(invalidBody.refusal_reasons).toContain("site_registry_relation_purge_not_supported");

    const unauthorized = await worker.fetch(new Request("https://registry.example/api/relations/transition", {
      method: "POST",
      body: JSON.stringify(relationFixture.site_withdrawal),
    }), runtime);
    const unauthorizedText = JSON.stringify(await unauthorized.json());
    expect(unauthorized.status).toBe(401);
    expect(unauthorizedText).not.toContain("withdraw-token");
    expect(unauthorizedText).not.toContain("relation-admin-token");
    expect(d1.relationEvents).toHaveLength(1);
  });

  it("verifies health, auth refusal, event projection, message exchange, finalize, and receipt", async () => {
    const runtime = env();
    const health = await worker.fetch(new Request("https://registry.example/health"), runtime);
    expect(health.status).toBe(200);

    const unauthorizedProjection = await worker.fetch(new Request("https://registry.example/api/projections/site-a"), runtime);
    expect(unauthorizedProjection.status).toBe(401);

    const eventResponse = await worker.fetch(new Request("https://registry.example/webhook", {
      method: "POST",
      headers: { authorization: "Bearer publish-token" },
      body: JSON.stringify({
        schema: "narada.site_event.envelope.v0",
        event_id: "evt-smoke",
        idempotency_key: "site-a:evt-smoke",
        source_site_id: "site-a",
        subject_site_id: "site-a",
        family: "site_health",
        type: "site.health.observed",
        observed_at: "2026-05-16T16:55:00.000Z",
        sent_at: "2026-05-16T16:55:01.000Z",
        auth: { kind: "bearer_capability_ref", capability_ref: "capability:site_registry.event_publish", authenticated: false },
        payload_bounds: { max_bytes: 128, raw_values_excluded: true },
        payload_summary: { status: "ok" },
        authority_limits: ["smoke_event_is_projection_input"],
      }),
    }), runtime);
    expect(eventResponse.status).toBe(202);

    const projection = await worker.fetch(new Request("https://registry.example/api/projections/site-a", {
      headers: { authorization: "Bearer read-token" },
    }), runtime);
    expect(projection.status).toBe(200);

    const submit = await worker.fetch(new Request("https://registry.example/api/messages", {
      method: "POST",
      headers: { authorization: "Bearer message-token" },
      body: JSON.stringify({
        target_site_id: "site-a",
        source: { kind: "cloudflare_worker", ref: "smoke-surface" },
        idempotency_key: "smoke-surface:1",
        kind: "observation",
        body: "Smoke message.",
        payload: {},
      }),
    }), runtime);
    const submitBody = await submit.json() as { message: { message_id: string } };
    expect(submit.status).toBe(202);

    const pending = await worker.fetch(new Request("https://registry.example/api/messages/pending", {
      headers: { authorization: "Bearer poll-token" },
    }), runtime);
    expect(pending.status).toBe(200);

    const finalize = await worker.fetch(new Request(`https://registry.example/api/messages/${submitBody.message.message_id}/finalize`, {
      method: "POST",
      headers: { authorization: "Bearer finalize-token" },
      body: JSON.stringify({
        schema: "narada.site_inbox.remote_finalize_payload.v0",
        status: "admitted",
        local_site_id: "site-a",
        local_admission_id: "env-smoke",
        local_kind: "observation",
        local_admitted_at: "2026-05-16T16:56:00.000Z",
      }),
    }), runtime);
    expect(finalize.status).toBe(200);

    const receipt = await worker.fetch(new Request(`https://registry.example/api/messages/${submitBody.message.message_id}/receipt`, {
      headers: { authorization: "Bearer poll-token" },
    }), runtime);
    const receiptText = JSON.stringify(await receipt.json());
    expect(receipt.status).toBe(200);
    expect(receiptText).toContain("env-smoke");
    expect(receiptText).not.toContain("publish-token");
    expect(receiptText).not.toContain("message-token");
    expect(receiptText).not.toContain("poll-token");
    expect(receiptText).not.toContain("finalize-token");
  });
});
