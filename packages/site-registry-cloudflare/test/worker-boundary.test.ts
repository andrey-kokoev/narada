import { describe, expect, it } from "vitest";
import worker, {
  HOSTED_SITE_REGISTRY_AUTHORITY_LIMITS,
  SITE_REGISTRY_CLOUDFLARE_BINDINGS,
  getSiteRegistryRelation,
  healthPayload,
  listSiteRegistryRelationEvents,
  recordSiteRegistryRelationTransition,
  routePosture,
  type SiteRegistryCloudflareEnv,
} from "../src/index.js";

class FakeKv {
  readonly values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

class FakeD1 {
  readonly rows: unknown[][] = [];
  readonly messages = new Map<string, Record<string, unknown>>();
  readonly events: Record<string, unknown>[] = [];
  readonly relations = new Map<string, Record<string, unknown>>();
  readonly relationEvents: Record<string, unknown>[] = [];

  prepare(sql: string) {
    return {
      bind: (...values: unknown[]) => ({
        run: async () => {
          this.rows.push(values);
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
            this.messages.set(String(message_id), {
              message_id,
              source_ref,
              idempotency_key,
              target_site_id,
              status,
              retry_count,
              received_at,
              message_json,
              receipt_json,
            });
          }
          if (sql.includes("update site_registry_remote_messages set retry_count")) {
            const [messageId] = values;
            const row = this.messages.get(String(messageId));
            if (row) row.retry_count = Number(row.retry_count ?? 0) + 1;
          }
          if (sql.includes("update site_registry_remote_messages set status")) {
            const [status, message_json, receipt_json, messageId] = values;
            const row = this.messages.get(String(messageId));
            if (row) {
              row.status = status;
              row.message_json = message_json;
              row.receipt_json = receipt_json;
            }
          }
          if (sql.includes("insert into site_registry_remote_message_events")) {
            const [message_id, event_type, refusal_reasons] = values;
            this.events.push({ message_id, event_type, refusal_reasons });
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
            const row = [...this.messages.values()].find((candidate) =>
              candidate.source_ref === values[0] && candidate.idempotency_key === values[1]);
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
          if (sql.includes("where status = ?")) {
            return {
              results: [...this.messages.values()]
                .filter((row) => row.status === values[0])
                .map((row) => ({ message_json: row.message_json })),
            };
          }
          return { results: [] };
        },
      }),
    };
  }
}

function event(overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
    schema: "narada.site_event.envelope.v0",
    event_id: "evt-1",
    idempotency_key: "idem-1",
    source_site_id: "site-a",
    subject_site_id: "site-a",
    family: "site_health",
    type: "site.health.observed",
    observed_at: now,
    sent_at: now,
    auth: {
      kind: "bearer_capability_ref",
      capability_ref: "capability:site_registry.event_publish",
      authenticated: false,
    },
    payload_bounds: { max_bytes: 1024, raw_values_excluded: true },
    payload_summary: { status: "ok" },
    authority_limits: ["event_is_projection_input_not_site_authority"],
    ...overrides,
  };
}

function env(): SiteRegistryCloudflareEnv {
  return {
    NARADA_SITE_REGISTRY_KV: new FakeKv() as unknown as KVNamespace,
    NARADA_SITE_REGISTRY_D1: new FakeD1() as unknown as D1Database,
    NARADA_SITE_REGISTRY_PUBLISH_TOKEN: "publish-token",
    NARADA_SITE_REGISTRY_READ_TOKEN: "read-token",
    NARADA_SITE_REGISTRY_MESSAGE_TOKEN: "message-token",
    NARADA_SITE_REGISTRY_POLL_TOKEN: "poll-token",
    NARADA_SITE_REGISTRY_LOCAL_ADMISSION_TOKEN: "finalize-token",
    NARADA_SITE_REGISTRY_RELATION_WITHDRAW_TOKEN: "withdraw-token",
    NARADA_SITE_REGISTRY_RELATION_ADMIN_TOKEN: "relation-admin-token",
    NARADA_SITE_REGISTRY_KNOWN_SITE_IDS: "site-a,site-b",
  };
}

function webhookRequest(body: unknown, token = "publish-token") {
  return new Request("https://registry.example/webhook", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

describe("@narada2/site-registry-cloudflare scaffold", () => {
  it("declares Cloudflare bindings without raw ids or secrets", () => {
    expect(SITE_REGISTRY_CLOUDFLARE_BINDINGS).toEqual({
      kv: "NARADA_SITE_REGISTRY_KV",
      d1: "NARADA_SITE_REGISTRY_D1",
      readToken: "NARADA_SITE_REGISTRY_READ_TOKEN",
      publishToken: "NARADA_SITE_REGISTRY_PUBLISH_TOKEN",
      messageToken: "NARADA_SITE_REGISTRY_MESSAGE_TOKEN",
      pollToken: "NARADA_SITE_REGISTRY_POLL_TOKEN",
      localAdmissionToken: "NARADA_SITE_REGISTRY_LOCAL_ADMISSION_TOKEN",
      adminToken: "NARADA_SITE_REGISTRY_ADMIN_TOKEN",
      relationWithdrawToken: "NARADA_SITE_REGISTRY_RELATION_WITHDRAW_TOKEN",
      relationAdminToken: "NARADA_SITE_REGISTRY_RELATION_ADMIN_TOKEN",
    });
  });

  it("keeps hosted registry routes projection-only", () => {
    expect(routePosture()).toEqual(expect.arrayContaining([
      { method: "GET", path: "/", status: "live_scaffold", authority: "projection_only" },
      { method: "GET", path: "/health", status: "live_scaffold", authority: "projection_only" },
      { method: "POST", path: "/webhook", status: "live", authority: "projection_only" },
    ]));
    expect(HOSTED_SITE_REGISTRY_AUTHORITY_LIMITS).toContain("hosted_registry_cannot_admit_inbox_or_task_state");
    expect(HOSTED_SITE_REGISTRY_AUTHORITY_LIMITS).toContain("hosted_registry_cannot_grant_capability");
  });

  it("health payload reports configured bindings as booleans and no authority claims", () => {
    const payload = healthPayload({
      NARADA_SITE_REGISTRY_MODE: "projection_only",
      NARADA_SITE_REGISTRY_READ_TOKEN: "secret-value",
    });
    const text = JSON.stringify(payload);

    expect(payload.status).toBe("scaffold");
    expect(payload.bindings.read_token_configured).toBe(true);
    expect(payload.projection_only).toBe(true);
    expect(payload.mutates_site).toBe(false);
    expect(payload.admits_inbox).toBe(false);
    expect(payload.mutates_task_lifecycle).toBe(false);
    expect(payload.certifies_identity).toBe(false);
    expect(payload.grants_capability).toBe(false);
    expect(text).not.toContain("secret-value");
  });

  it("serves scaffold routes without invoking Cycle runtime authority", async () => {
    const health = await worker.fetch(new Request("https://registry.example/health"), {});
    const healthJson = await health.json() as { projection_only: boolean; routes: unknown[] };
    const sites = await worker.fetch(new Request("https://registry.example/api/sites"), {});
    const root = await worker.fetch(new Request("https://registry.example/"), {});

    expect(health.status).toBe(200);
    expect(healthJson.projection_only).toBe(true);
    expect(healthJson.routes.length).toBeGreaterThan(0);
    expect(sites.status).toBe(200);
    expect(root.headers.get("content-type")).toContain("text/html");
  });

  it("accepts authenticated known bounded typed events and updates projection storage", async () => {
    const runtime = env();
    const response = await worker.fetch(webhookRequest(event()), runtime);
    const body = await response.json() as { status: string; projection_event_recorded: boolean; projection: { site_id: string } };
    const kv = runtime.NARADA_SITE_REGISTRY_KV as unknown as FakeKv;
    const storedProjection = JSON.parse(kv.values.get("site-registry:projection:site-a") ?? "{}");

    expect(response.status).toBe(202);
    expect(body.status).toBe("accepted");
    expect(body.projection_event_recorded).toBe(true);
    expect(body.projection.site_id).toBe("site-a");
    expect(storedProjection.latest_health.status).toBe("ok");
    expect(JSON.stringify([...kv.values.values()])).not.toContain("publish-token");
  });

  it("accepts future telemetry contract events through the generic validator before projection storage", async () => {
    const runtime = env();
    const response = await worker.fetch(webhookRequest(event({
      schema: "narada.site_telemetry.event.v0",
      event_id: "evt-future",
      idempotency_key: "site-a:evt-future",
      publication_edge_id: "pubedge_fixture",
      surface_id: "surface_fixture",
      freshness: { status: "fresh", computed_by_receiver: false },
      evidence_refs: ["fixture:evidence"],
      provenance: { projection_only: true, publisher_runtime: "test" },
    })), runtime);
    const body = await response.json() as { status: string; event_id: string; projection: { site_id: string } };

    expect(response.status).toBe(202);
    expect(body.status).toBe("accepted");
    expect(body.event_id).toBe("evt-future");
    expect(body.projection.site_id).toBe("site-a");
  });

  it("handles duplicate idempotency without rewriting projection state", async () => {
    const runtime = env();
    await worker.fetch(webhookRequest(event()), runtime);
    const kv = runtime.NARADA_SITE_REGISTRY_KV as unknown as FakeKv;
    const before = kv.values.get("site-registry:site-events:site-a");
    const response = await worker.fetch(webhookRequest(event({
      event_id: "evt-duplicate",
      payload_summary: { status: "changed" },
    })), runtime);
    const body = await response.json() as { status: string; projection_event_recorded: boolean };

    expect(response.status).toBe(200);
    expect(body.status).toBe("duplicate");
    expect(body.projection_event_recorded).toBe(false);
    expect(kv.values.get("site-registry:site-events:site-a")).toBe(before);
  });

  it("refuses unknown Site events without projection writes", async () => {
    const runtime = env();
    const response = await worker.fetch(webhookRequest(event({ source_site_id: "unknown-site" })), runtime);
    const body = await response.json() as { status: string; refusal_reasons: string[] };
    const kv = runtime.NARADA_SITE_REGISTRY_KV as unknown as FakeKv;

    expect(response.status).toBe(400);
    expect(body.status).toBe("refused");
    expect(body.refusal_reasons).toContain("site_event_source_unknown");
    expect(kv.values.size).toBe(0);
  });

  it("refuses unauthorized events without storing the raw bearer value", async () => {
    const runtime = env();
    const response = await worker.fetch(webhookRequest(event(), "bad-token"), runtime);
    const body = await response.json() as { status: string; refusal_reasons: string[] };
    const kv = runtime.NARADA_SITE_REGISTRY_KV as unknown as FakeKv;

    expect(response.status).toBe(401);
    expect(body.status).toBe("refused");
    expect(body.refusal_reasons).toContain("site_event_bearer_token_invalid");
    expect(JSON.stringify(body)).not.toContain("bad-token");
    expect(kv.values.size).toBe(0);
  });

  it("refuses malformed contract data, oversized payload, and raw secret summaries", async () => {
    const unsupported = await worker.fetch(webhookRequest(event({ family: "unknown_family" })), env());
    const oversized = await worker.fetch(webhookRequest(event({ payload_bounds: { max_bytes: 999999, raw_values_excluded: true } })), env());
    const rawSecret = await worker.fetch(webhookRequest(event({ payload_summary: { api_token: "raw" } })), env());

    expect((await unsupported.json() as { refusal_reasons: string[] }).refusal_reasons)
      .toEqual(expect.arrayContaining([
        expect.stringContaining("site_event_contract_invalid"),
        expect.stringContaining("site_telemetry_event_family_invalid"),
      ]));
    expect((await oversized.json() as { refusal_reasons: string[] }).refusal_reasons)
      .toContain("site_event_payload_too_large");
    expect((await rawSecret.json() as { refusal_reasons: string[] }).refusal_reasons)
      .toEqual(expect.arrayContaining([
        expect.stringContaining("site_event_contract_invalid"),
        expect.stringContaining("site_telemetry_event_payload_summary_contains_raw_value_marker"),
      ]));
  });

  it("serves bounded registry summary and freshness without raw event payloads", async () => {
    const runtime = env();
    await worker.fetch(webhookRequest(event()), runtime);

    const sites = await worker.fetch(new Request("https://registry.example/api/sites"), runtime);
    const freshness = await worker.fetch(new Request("https://registry.example/api/freshness"), runtime);
    const sitesBody = await sites.json() as {
      projection_only: boolean;
      mutates_site: boolean;
      admits_inbox: boolean;
      mutates_task_lifecycle: boolean;
      grants_capability: boolean;
      summary: { site_count: number; fresh_count: number; missing_count: number };
      sites: Array<{ site_id: string; latest_health_status: string; provenance_count: number }>;
    };
    const freshnessText = JSON.stringify(await freshness.json());

    expect(sites.status).toBe(200);
    expect(sitesBody.projection_only).toBe(true);
    expect(sitesBody.mutates_site).toBe(false);
    expect(sitesBody.admits_inbox).toBe(false);
    expect(sitesBody.mutates_task_lifecycle).toBe(false);
    expect(sitesBody.grants_capability).toBe(false);
    expect(sitesBody.summary.site_count).toBe(2);
    expect(sitesBody.summary.fresh_count).toBe(1);
    expect(sitesBody.summary.missing_count).toBe(1);
    expect(sitesBody.sites.find((site) => site.site_id === "site-a")?.latest_health_status).toBe("ok");
    expect(freshnessText).not.toContain("publish-token");
    expect(freshnessText).not.toContain("read-token");
    expect(freshnessText).not.toContain("payload_summary");
  });

  it("filters public Site APIs by active visible relation lifecycle while retaining projection evidence", async () => {
    const runtime = env();
    const d1 = runtime.NARADA_SITE_REGISTRY_D1 as unknown as FakeD1;
    await worker.fetch(webhookRequest(event()), runtime);

    const withdrawal = await worker.fetch(new Request("https://registry.example/api/relations/transition", {
      method: "POST",
      headers: { authorization: "Bearer withdraw-token" },
      body: JSON.stringify({
        event_id: "rel-event-withdraw-filter",
        idempotency_key: "rel-idem-withdraw-filter",
        registry_id: "registry-a",
        relation_id: "rel_site-a_registry",
        site_id: "site-a",
        relation_kind: "publishes_to",
        transition: "withdraw",
        to_state: "withdrawn",
        to_visibility: "private",
        actor: { kind: "site", site_id: "site-a" },
        capability_ref: "capability:site_registry.relation.withdraw.site-a",
        occurred_at: "2026-05-16T23:40:00.000Z",
        reason_codes: ["site_requested_registry_forget_public_projection"],
        evidence_refs: ["test:relation:withdraw-filter"],
      }),
    }), runtime);
    expect(withdrawal.status).toBe(202);

    const sites = await worker.fetch(new Request("https://registry.example/api/sites"), runtime);
    const freshness = await worker.fetch(new Request("https://registry.example/api/freshness"), runtime);
    const retainedProjection = await worker.fetch(new Request("https://registry.example/api/projections/site-a", {
      headers: { authorization: "Bearer read-token" },
    }), runtime);
    const sitesBody = await sites.json() as {
      summary: { site_count: number; fresh_count: number; missing_count: number };
      sites: Array<{ site_id: string; relation?: { state: string; visibility: string } }>;
    };
    const freshnessText = JSON.stringify(await freshness.json());
    const retainedBody = await retainedProjection.json() as { status: string; projection: { site_id: string } };

    expect(sitesBody.summary.site_count).toBe(1);
    expect(sitesBody.summary.fresh_count).toBe(0);
    expect(sitesBody.summary.missing_count).toBe(1);
    expect(sitesBody.sites.map((site) => site.site_id)).toEqual(["site-b"]);
    expect(sitesBody.sites[0]?.relation).toMatchObject({ state: "active", visibility: "public" });
    expect(freshnessText).not.toContain("site-a");
    expect(retainedProjection.status).toBe(200);
    expect(retainedBody.projection.site_id).toBe("site-a");
    expect(d1.relationEvents).toHaveLength(1);
  });

  it("keeps retired and suppressed relations out of public tiles", async () => {
    const runtime = env();
    runtime.NARADA_SITE_REGISTRY_KNOWN_SITE_IDS = "site-a,site-b,site-c";
    const d1 = runtime.NARADA_SITE_REGISTRY_D1 as unknown as D1Database;
    await recordSiteRegistryRelationTransition(d1, {
      event_id: "rel-event-suppress-site-b",
      idempotency_key: "rel-idem-suppress-site-b",
      registry_id: "registry-a",
      relation_id: "rel_site-b_registry",
      site_id: "site-b",
      relation_kind: "publishes_to",
      transition: "suppress",
      to_state: "active",
      to_visibility: "suppressed",
      actor: { kind: "registry_owner", site_id: "registry-a" },
      capability_ref: "capability:site_registry.relation.admin.suppress",
      occurred_at: "2026-05-16T23:41:00.000Z",
      reason_codes: ["operator_attention_required"],
      evidence_refs: ["test:relation:suppress"],
    });
    await recordSiteRegistryRelationTransition(d1, {
      event_id: "rel-event-retire-site-c",
      idempotency_key: "rel-idem-retire-site-c",
      registry_id: "registry-a",
      relation_id: "rel_site-c_registry",
      site_id: "site-c",
      relation_kind: "publishes_to",
      transition: "retire",
      to_state: "retired",
      to_visibility: "private",
      actor: { kind: "registry_owner", site_id: "registry-a" },
      capability_ref: "capability:site_registry.relation.admin.retire",
      occurred_at: "2026-05-16T23:42:00.000Z",
      reason_codes: ["site_retired"],
      evidence_refs: ["test:relation:retire"],
    });

    const response = await worker.fetch(new Request("https://registry.example/api/sites"), runtime);
    const body = await response.json() as {
      summary: { site_count: number };
      sites: Array<{ site_id: string }>;
    };

    expect(body.summary.site_count).toBe(1);
    expect(body.sites.map((site) => site.site_id)).toEqual(["site-a"]);
  });

  it("requires read capability for per-Site projection details and redacts bearer values", async () => {
    const runtime = env();
    await worker.fetch(webhookRequest(event()), runtime);

    const unauthorized = await worker.fetch(new Request("https://registry.example/api/projections/site-a"), runtime);
    const authorized = await worker.fetch(new Request("https://registry.example/api/projections/site-a", {
      headers: { authorization: "Bearer read-token" },
    }), runtime);
    const unauthorizedText = JSON.stringify(await unauthorized.json());
    const authorizedBody = await authorized.json() as {
      status: string;
      projection_only: boolean;
      projection: { site_id: string; latest_health: { status: string } };
    };

    expect(unauthorized.status).toBe(401);
    expect(unauthorizedText).not.toContain("read-token");
    expect(authorized.status).toBe(200);
    expect(authorizedBody.status).toBe("ok");
    expect(authorizedBody.projection_only).toBe(true);
    expect(authorizedBody.projection.site_id).toBe("site-a");
    expect(authorizedBody.projection.latest_health.status).toBe("ok");
  });

  it("records relation lifecycle transitions as D1 current state plus retained event evidence", async () => {
    const runtime = env();
    const d1 = runtime.NARADA_SITE_REGISTRY_D1 as D1Database;
    const activate = await recordSiteRegistryRelationTransition(d1, {
      event_id: "rel-event-1",
      idempotency_key: "site-a:activate:1",
      registry_id: "site-registry:test",
      relation_id: "rel_site-a_registry",
      site_id: "site-a",
      relation_kind: "publishes_to",
      transition: "activate",
      to_state: "active",
      to_visibility: "public",
      actor: { kind: "registry_owner", site_id: "registry-site", principal: "test" },
      capability_ref: "capability:site_registry.relation.activate",
      occurred_at: "2026-05-16T23:30:00.000Z",
      reason_codes: ["fixture_active_relation"],
      evidence_refs: ["test:relation:activate"],
    });
    const withdraw = await recordSiteRegistryRelationTransition(d1, {
      event_id: "rel-event-2",
      idempotency_key: "site-a:withdraw:1",
      registry_id: "site-registry:test",
      relation_id: "rel_site-a_registry",
      site_id: "site-a",
      relation_kind: "publishes_to",
      transition: "withdraw",
      from_state: "active",
      to_state: "withdrawn",
      from_visibility: "public",
      to_visibility: "private",
      actor: { kind: "site", site_id: "site-a", principal: "site-a.operator" },
      capability_ref: "capability:site_registry.relation.withdraw.site-a",
      occurred_at: "2026-05-16T23:31:00.000Z",
      reason_codes: ["site_requested_not_counted"],
      evidence_refs: ["test:relation:withdraw"],
    });
    const relation = await getSiteRegistryRelation(d1, "rel_site-a_registry");
    const events = await listSiteRegistryRelationEvents(d1, "rel_site-a_registry");

    expect(activate.status).toBe("applied");
    expect(withdraw.status).toBe("applied");
    expect(relation?.state).toBe("withdrawn");
    expect(relation?.visibility).toBe("private");
    expect(relation?.created_at).toBe("2026-05-16T23:30:00.000Z");
    expect(events.map((entry) => entry.transition)).toEqual(["activate", "withdraw"]);
    expect(JSON.stringify(events)).not.toContain("publish-token");
    expect(JSON.stringify(events)).not.toContain("read-token");
  });

  it("deduplicates relation lifecycle transitions by relation id and idempotency key", async () => {
    const runtime = env();
    const d1 = runtime.NARADA_SITE_REGISTRY_D1 as D1Database;
    const input = {
      event_id: "rel-event-1",
      idempotency_key: "site-a:activate:1",
      registry_id: "site-registry:test",
      relation_id: "rel_site-a_registry",
      site_id: "site-a",
      relation_kind: "publishes_to",
      transition: "activate" as const,
      to_state: "active" as const,
      to_visibility: "public" as const,
      actor: { kind: "registry_owner" as const, site_id: "registry-site", principal: "test" },
      capability_ref: "capability:site_registry.relation.activate",
      occurred_at: "2026-05-16T23:30:00.000Z",
      reason_codes: ["fixture_active_relation"],
      evidence_refs: ["test:relation:activate"],
    };
    const first = await recordSiteRegistryRelationTransition(d1, input);
    const second = await recordSiteRegistryRelationTransition(d1, {
      ...input,
      event_id: "rel-event-retry",
      occurred_at: "2026-05-16T23:35:00.000Z",
    });
    const events = await listSiteRegistryRelationEvents(d1, "rel_site-a_registry");

    expect(first.status).toBe("applied");
    expect(second.status).toBe("duplicate");
    expect(second.event.event_id).toBe("rel-event-1");
    expect(events).toHaveLength(1);
  });

  it("accepts protected relation withdrawal and returns bounded cloud receipt only", async () => {
    const runtime = env();
    const response = await worker.fetch(new Request("https://registry.example/api/relations/transition", {
      method: "POST",
      headers: { authorization: "Bearer withdraw-token" },
      body: JSON.stringify({
        event_id: "rel-event-withdraw",
        idempotency_key: "site-a:withdraw:api",
        registry_id: "site-registry:test",
        relation_id: "rel_site-a_registry",
        site_id: "site-a",
        relation_kind: "publishes_to",
        transition: "withdraw",
        to_state: "withdrawn",
        to_visibility: "private",
        actor: { kind: "site", site_id: "site-a", principal: "site-a.operator" },
        capability_ref: "capability:site_registry.relation.withdraw.site-a",
        occurred_at: "2026-05-16T23:40:00.000Z",
        reason_codes: ["site_requested_not_counted"],
        evidence_refs: ["test:withdraw"],
      }),
    }), runtime);
    const body = await response.json() as {
      status: string;
      cloud_receipt_only: boolean;
      local_inbox_mutated: boolean;
      mutates_site_authority: boolean;
      relation: { state: string; visibility: string };
    };
    const d1 = runtime.NARADA_SITE_REGISTRY_D1 as unknown as FakeD1;

    expect(response.status).toBe(202);
    expect(body.status).toBe("applied");
    expect(body.cloud_receipt_only).toBe(true);
    expect(body.local_inbox_mutated).toBe(false);
    expect(body.mutates_site_authority).toBe(false);
    expect(body.relation.state).toBe("withdrawn");
    expect(body.relation.visibility).toBe("private");
    expect(d1.relationEvents).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain("withdraw-token");
  });

  it("accepts registry-owner relation suppression with separate admin capability", async () => {
    const runtime = env();
    const response = await worker.fetch(new Request("https://registry.example/api/relations/transition", {
      method: "POST",
      headers: { authorization: "Bearer relation-admin-token" },
      body: JSON.stringify({
        event_id: "rel-event-suppress",
        idempotency_key: "site-a:suppress:api",
        registry_id: "site-registry:test",
        relation_id: "rel_site-a_registry",
        site_id: "site-a",
        relation_kind: "publishes_to",
        transition: "suppress",
        to_state: "active",
        to_visibility: "suppressed",
        actor: { kind: "registry_owner", site_id: "registry-site", principal: "operator" },
        capability_ref: "capability:site_registry.relation.admin.suppress",
        occurred_at: "2026-05-16T23:41:00.000Z",
        reason_codes: ["registry_owner_suppressed_public_projection"],
        evidence_refs: ["test:suppress"],
      }),
    }), runtime);
    const body = await response.json() as { relation: { state: string; visibility: string } };

    expect(response.status).toBe(202);
    expect(body.relation.state).toBe("active");
    expect(body.relation.visibility).toBe("suppressed");
  });

  it("refuses unauthorized or invalid relation transitions without writing state", async () => {
    const runtime = env();
    const invalidToken = await worker.fetch(new Request("https://registry.example/api/relations/transition", {
      method: "POST",
      headers: { authorization: "Bearer wrong-token" },
      body: JSON.stringify({
        event_id: "rel-event-withdraw",
        idempotency_key: "site-a:withdraw:bad-token",
        registry_id: "site-registry:test",
        relation_id: "rel_site-a_registry",
        site_id: "site-a",
        relation_kind: "publishes_to",
        transition: "withdraw",
        to_state: "withdrawn",
        to_visibility: "private",
        actor: { kind: "site", site_id: "site-a" },
        capability_ref: "capability:site_registry.relation.withdraw.site-a",
        occurred_at: "2026-05-16T23:42:00.000Z",
        reason_codes: ["site_requested_not_counted"],
        evidence_refs: ["test:withdraw"],
      }),
    }), runtime);
    const purge = await worker.fetch(new Request("https://registry.example/api/relations/transition", {
      method: "POST",
      headers: { authorization: "Bearer relation-admin-token" },
      body: JSON.stringify({
        event_id: "rel-event-purge",
        idempotency_key: "site-a:purge:api",
        registry_id: "site-registry:test",
        relation_id: "rel_site-a_registry",
        site_id: "site-a",
        relation_kind: "publishes_to",
        transition: "purge",
        to_state: "retired",
        to_visibility: "private",
        actor: { kind: "registry_owner", site_id: "registry-site" },
        capability_ref: "capability:site_registry.relation.admin.purge",
        occurred_at: "2026-05-16T23:43:00.000Z",
        reason_codes: ["operator_requested_purge"],
        evidence_refs: ["test:purge"],
      }),
    }), runtime);
    const invalidText = JSON.stringify(await invalidToken.json());
    const purgeBody = await purge.json() as { refusal_reasons: string[] };
    const d1 = runtime.NARADA_SITE_REGISTRY_D1 as unknown as FakeD1;

    expect(invalidToken.status).toBe(401);
    expect(invalidText).not.toContain("wrong-token");
    expect(purge.status).toBe(400);
    expect(purgeBody.refusal_reasons).toContain("site_registry_relation_purge_not_supported");
    expect(d1.relationEvents).toHaveLength(0);
  });

  it("deduplicates relation transition API retries", async () => {
    const runtime = env();
    const payload = {
      event_id: "rel-event-withdraw",
      idempotency_key: "site-a:withdraw:api",
      registry_id: "site-registry:test",
      relation_id: "rel_site-a_registry",
      site_id: "site-a",
      relation_kind: "publishes_to",
      transition: "withdraw",
      to_state: "withdrawn",
      to_visibility: "private",
      actor: { kind: "site", site_id: "site-a" },
      capability_ref: "capability:site_registry.relation.withdraw.site-a",
      occurred_at: "2026-05-16T23:44:00.000Z",
      reason_codes: ["site_requested_not_counted"],
      evidence_refs: ["test:withdraw"],
    };
    const first = await worker.fetch(new Request("https://registry.example/api/relations/transition", {
      method: "POST",
      headers: { authorization: "Bearer withdraw-token" },
      body: JSON.stringify(payload),
    }), runtime);
    const second = await worker.fetch(new Request("https://registry.example/api/relations/transition", {
      method: "POST",
      headers: { authorization: "Bearer withdraw-token" },
      body: JSON.stringify({ ...payload, event_id: "rel-event-withdraw-retry" }),
    }), runtime);
    const firstBody = await first.json() as { status: string };
    const secondBody = await second.json() as { status: string; event: { event_id: string } };
    const d1 = runtime.NARADA_SITE_REGISTRY_D1 as unknown as FakeD1;

    expect(firstBody.status).toBe("applied");
    expect(secondBody.status).toBe("duplicate");
    expect(secondBody.event.event_id).toBe("rel-event-withdraw");
    expect(d1.relationEvents).toHaveLength(1);
  });

  it("serves a human peek page that loads summary API without embedding evidence payloads or tokens", async () => {
    const root = await worker.fetch(new Request("https://registry.example/"), env());
    const text = await root.text();

    expect(root.status).toBe(200);
    expect(text).toContain("fetch(\"/api/sites\"");
    expect(text).toContain("site-grid");
    expect(text).toContain("site-tile");
    expect(text).toContain("Active agents");
    expect(text).toContain("Open tasks");
    expect(text).toContain("Operator attention");
    expect(text).toContain("Critical action");
    expect(text).toContain("Relation lifecycle posture");
    expect(text).toContain("state:");
    expect(text).toContain("visibility:");
    expect(text).toContain("No active public Site relations.");
    expect(text).toContain("Withdrawn, retired, suppressed, or private relations are withheld");
    expect(text).toContain("not projected");
    expect(text).toContain("projection only");
    expect(text).not.toContain("relation-admin-token");
    expect(text).not.toContain("withdraw-token");
    expect(text).not.toContain("method=\"POST\"");
    expect(text).not.toContain("/api/relations/transition\"");
    expect(text).not.toContain("publish-token");
    expect(text).not.toContain("read-token");
    expect(text).not.toContain("payload_summary");
  });

  it("submits remote messages as pending cloud state and returns cloud receipts", async () => {
    const runtime = env();
    const response = await worker.fetch(new Request("https://registry.example/api/messages", {
      method: "POST",
      headers: { authorization: "Bearer message-token" },
      body: JSON.stringify({
        target_site_id: "site-a",
        source: { kind: "cloudflare_worker", ref: "remote-surface", principal: "operator.remote", site: "remote-site" },
        idempotency_key: "remote-surface:1",
        kind: "observation",
        subject: "Check projection",
        body: "Projection looks stale.",
        payload: { evidence_ref: "remote:msg:1" },
      }),
    }), runtime);
    const body = await response.json() as {
      schema: string;
      status: string;
      cloud_receipt_only: boolean;
      remote_surface_authority: string;
      local_site_admission_required: boolean;
      local_inbox_mutated: boolean;
      candidate: {
        schema: string;
        candidate_id: string;
        surface_id: string;
        target_authority: string;
        replay_key: string;
        payload_bounds: { raw_values_excluded: boolean };
        admission_posture: { cloud_receipt_is_local_admission: boolean };
        authority_limits: string[];
        local_inbox_mutated: boolean;
      };
      cloud_receipt: { schema: string; candidate_id: string; surface_id: string; cloud_receipt_only: boolean; remote_surface_authority: string };
      receipt: { status: string };
      message: { message_id: string };
    };
    const d1 = runtime.NARADA_SITE_REGISTRY_D1 as unknown as FakeD1;

    expect(response.status).toBe(202);
    expect(body.schema).toBe("narada.remote_candidate.submit_response.v0");
    expect(body.status).toBe("submitted");
    expect(body.candidate.schema).toBe("narada.remote_candidate.message.v0");
    expect(body.candidate.surface_id).toBe("cloudflare-hosted-site-registry");
    expect(body.candidate.target_authority).toBe("canonical_inbox");
    expect(body.candidate.replay_key).toBe("remote-surface:1");
    expect(body.candidate.payload_bounds.raw_values_excluded).toBe(true);
    expect(body.candidate.admission_posture.cloud_receipt_is_local_admission).toBe(false);
    expect(body.candidate.authority_limits).toContain("remote_candidate_is_not_local_inbox_admission");
    expect(body.cloud_receipt.schema).toBe("narada.remote_candidate.receipt.v0");
    expect(body.cloud_receipt.candidate_id).toBe(body.candidate.candidate_id);
    expect(body.cloud_receipt.surface_id).toBe(body.candidate.surface_id);
    expect(body.cloud_receipt.remote_surface_authority).toBe("candidate_only");
    expect(body.cloud_receipt_only).toBe(true);
    expect(body.remote_surface_authority).toBe("candidate_only");
    expect(body.local_site_admission_required).toBe(true);
    expect(body.candidate.local_inbox_mutated).toBe(false);
    expect(body.message.local_inbox_mutated).toBe(false);
    expect(body.receipt.status).toBe("pending");
    expect(d1.messages.size).toBe(1);
    expect(d1.events.some((row) => row.event_type === "submitted")).toBe(true);
  });

  it("keeps message submit, poll, and finalize capabilities separate", async () => {
    const runtime = env();
    const submitWithPoll = await worker.fetch(new Request("https://registry.example/api/messages", {
      method: "POST",
      headers: { authorization: "Bearer poll-token" },
      body: JSON.stringify({}),
    }), runtime);
    const pollWithSubmit = await worker.fetch(new Request("https://registry.example/api/messages/pending", {
      headers: { authorization: "Bearer message-token" },
    }), runtime);

    expect(submitWithPoll.status).toBe(401);
    expect(pollWithSubmit.status).toBe(401);
  });

  it("treats duplicate remote message submits as idempotent retries", async () => {
    const runtime = env();
    const requestBody = {
      schema: "narada.remote_candidate.message.v0",
      candidate_id: "remote_msg_duplicate",
      surface_id: "cloudflare-hosted-site-registry",
      target_site_id: "site-a",
      target_authority: "canonical_inbox",
      source: { kind: "cloudflare_worker", ref: "remote-surface" },
      replay_key: "remote-surface:1",
      kind: "proposal",
      body: "Please inspect.",
      payload: {},
      payload_bounds: { max_bytes: 2, raw_values_excluded: true },
      crossing: {
        scale: "site",
        authority_scope: "site-a",
        from_locus: "remote-surface",
        to_locus: "site-a",
        owning_site: "site-a",
        target_authority: "canonical_inbox",
        requested_crossing: "admission_request",
        admission_state: "received",
      },
      admission_posture: { remote_surface_authority: "candidate_only", local_site_admission_required: true },
      authority_limits: ["remote_candidate_is_not_local_inbox_admission"],
    };
    await worker.fetch(new Request("https://registry.example/api/messages", {
      method: "POST",
      headers: { authorization: "Bearer message-token" },
      body: JSON.stringify(requestBody),
    }), runtime);
    const duplicate = await worker.fetch(new Request("https://registry.example/api/messages", {
      method: "POST",
      headers: { authorization: "Bearer message-token" },
      body: JSON.stringify(requestBody),
    }), runtime);
    const duplicateBody = await duplicate.json() as {
      schema: string;
      status: string;
      candidate: { replay_key: string };
      cloud_receipt: { status: string };
      receipt: { status: string };
    };
    const d1 = runtime.NARADA_SITE_REGISTRY_D1 as unknown as FakeD1;
    const row = [...d1.messages.values()][0];

    expect(duplicate.status).toBe(200);
    expect(duplicateBody.schema).toBe("narada.remote_candidate.submit_response.v0");
    expect(duplicateBody.status).toBe("duplicate");
    expect(duplicateBody.candidate.replay_key).toBe("remote-surface:1");
    expect(duplicateBody.cloud_receipt.status).toBe("pending");
    expect(duplicateBody.receipt.status).toBe("pending");
    expect(row.retry_count).toBe(1);
    expect(d1.events.some((eventRow) => eventRow.event_type === "duplicate_submit")).toBe(true);
  });

  it("refuses malformed generic remote candidates without storing them", async () => {
    const runtime = env();
    const response = await worker.fetch(new Request("https://registry.example/api/messages", {
      method: "POST",
      headers: { authorization: "Bearer message-token" },
      body: JSON.stringify({
        schema: "narada.remote_candidate.message.v0",
        source: { kind: "cloudflare_worker", ref: "remote-surface" },
        replay_key: "remote-surface:bad",
        kind: "proposal",
        payload_bounds: { raw_values_excluded: true },
      }),
    }), runtime);
    const body = await response.json() as { refusal_reasons: string[]; projection_event_recorded: boolean; admits_inbox: boolean };
    const d1 = runtime.NARADA_SITE_REGISTRY_D1 as unknown as FakeD1;

    expect(response.status).toBe(400);
    expect(body.refusal_reasons).toEqual(expect.arrayContaining([
      "remote_message_target_site_id_required",
      "remote_message_body_required",
      "remote_candidate_candidate_id_required",
      "remote_candidate_surface_id_required",
      "remote_candidate_target_authority_required",
      "remote_candidate_crossing_required",
      "remote_candidate_admission_posture_required",
      "remote_candidate_authority_limits_required",
    ]));
    expect(body.projection_event_recorded).toBe(false);
    expect(body.admits_inbox).toBe(false);
    expect(d1.messages.size).toBe(0);
  });

  it("refuses unauthorized generic remote candidates before storage", async () => {
    const runtime = env();
    const response = await worker.fetch(new Request("https://registry.example/api/messages", {
      method: "POST",
      headers: { authorization: "Bearer wrong-token" },
      body: JSON.stringify({
        schema: "narada.remote_candidate.message.v0",
        candidate_id: "remote_msg_unauthorized",
        surface_id: "cloudflare-hosted-site-registry",
        target_site_id: "site-a",
        target_authority: "canonical_inbox",
        source: { kind: "cloudflare_worker", ref: "remote-surface" },
        replay_key: "remote-surface:unauthorized",
        kind: "proposal",
        body: "Should not store.",
        payload_bounds: { raw_values_excluded: true },
        crossing: {
          scale: "site",
          authority_scope: "site-a",
          from_locus: "remote-surface",
          to_locus: "site-a",
          owning_site: "site-a",
          target_authority: "canonical_inbox",
          requested_crossing: "admission_request",
          admission_state: "received",
        },
        admission_posture: { remote_surface_authority: "candidate_only", local_site_admission_required: true },
        authority_limits: ["remote_candidate_is_not_local_inbox_admission"],
      }),
    }), runtime);
    const body = await response.json() as { refusal_reasons: string[]; admits_inbox: boolean };
    const d1 = runtime.NARADA_SITE_REGISTRY_D1 as unknown as FakeD1;

    expect(response.status).toBe(401);
    expect(body.refusal_reasons).toContain("site_registry_message_submit_token_invalid");
    expect(body.admits_inbox).toBe(false);
    expect(d1.messages.size).toBe(0);
  });

  it("lists pending messages with local admission plans without mutating local inbox", async () => {
    const runtime = env();
    await worker.fetch(new Request("https://registry.example/api/messages", {
      method: "POST",
      headers: { authorization: "Bearer message-token" },
      body: JSON.stringify({
        target_site_id: "site-a",
        source: { kind: "cloudflare_worker", ref: "remote-surface", site: "remote-site" },
        idempotency_key: "remote-surface:1",
        kind: "task_candidate",
        body: "Create follow-up.",
        payload: { title: "Follow up" },
      }),
    }), runtime);
    const pending = await worker.fetch(new Request("https://registry.example/api/messages/pending", {
      headers: { authorization: "Bearer poll-token" },
    }), runtime);
    const body = await pending.json() as {
      schema: string;
      messages: Array<{ candidate: { schema: string }; admission_plan: { remote_surface_authority: string; envelope_written: boolean; db_mutated: boolean } }>;
      admits_inbox: boolean;
    };

    expect(pending.status).toBe(200);
    expect(body.schema).toBe("narada.remote_candidate.pending_response.v0");
    expect(body.messages.length).toBe(1);
    expect(body.messages[0].candidate.schema).toBe("narada.remote_candidate.message.v0");
    expect(body.messages[0].admission_plan.remote_surface_authority).toBe("candidate_only");
    expect(body.messages[0].admission_plan.envelope_written).toBe(false);
    expect(body.messages[0].admission_plan.db_mutated).toBe(false);
    expect(body.admits_inbox).toBe(false);
  });

  it("finalizes admitted, rejected, and error receipts as references only", async () => {
    const admittedRuntime = env();
    const submit = await worker.fetch(new Request("https://registry.example/api/messages", {
      method: "POST",
      headers: { authorization: "Bearer message-token" },
      body: JSON.stringify({
        target_site_id: "site-a",
        source: { kind: "cloudflare_worker", ref: "remote-surface" },
        idempotency_key: "remote-surface:admit",
        kind: "observation",
        body: "Admit me.",
        payload: {},
      }),
    }), admittedRuntime);
    const messageId = ((await submit.json()) as { message: { message_id: string } }).message.message_id;
    const admitted = await worker.fetch(new Request(`https://registry.example/api/messages/${messageId}/finalize`, {
      method: "POST",
      headers: { authorization: "Bearer finalize-token" },
      body: JSON.stringify({
        schema: "narada.remote_candidate.finalize.v0",
        status: "admitted",
        local_site_id: "site-a",
        local_admission_id: "env-1",
        local_kind: "observation",
        local_admitted_at: "2026-05-16T16:35:00.000Z",
      }),
    }), admittedRuntime);
    const receipt = await worker.fetch(new Request(`https://registry.example/api/messages/${messageId}/receipt`, {
      headers: { authorization: "Bearer poll-token" },
    }), admittedRuntime);
    const admittedBody = await admitted.json() as { status: string; local_admission_is_reference_only: boolean; local_inbox_mutated: boolean };
    const receiptBody = await receipt.json() as { receipt: { status: string; local_admission?: { admission_id: string } } };

    expect(admitted.status).toBe(200);
    expect(admittedBody.status).toBe("admitted");
    expect(admittedBody.local_admission_is_reference_only).toBe(true);
    expect(admittedBody.local_inbox_mutated).toBe(false);
    expect(receiptBody.receipt.status).toBe("admitted");
    expect(receiptBody.receipt.local_admission?.admission_id).toBe("env-1");

    for (const [status, body] of [
      ["rejected", { schema: "narada.site_inbox.remote_finalize_payload.v0", status: "rejected", rejected_reason: "operator_rejected" }],
      ["error", { schema: "narada.site_inbox.remote_finalize_payload.v0", status: "error", error: { code: "local_admission_failed", message: "locked", retryable: true } }],
    ] as const) {
      const runtime = env();
      const created = await worker.fetch(new Request("https://registry.example/api/messages", {
        method: "POST",
        headers: { authorization: "Bearer message-token" },
        body: JSON.stringify({
          target_site_id: "site-a",
          source: { kind: "cloudflare_worker", ref: `remote-surface-${status}` },
          idempotency_key: `remote-surface:${status}`,
          kind: "observation",
          body: "Finalize me.",
          payload: {},
        }),
      }), runtime);
      const id = ((await created.json()) as { message: { message_id: string } }).message.message_id;
      const finalized = await worker.fetch(new Request(`https://registry.example/api/messages/${id}/finalize`, {
        method: "POST",
        headers: { authorization: "Bearer finalize-token" },
        body: JSON.stringify(body),
      }), runtime);
      expect(finalized.status).toBe(200);
      expect(((await finalized.json()) as { status: string }).status).toBe(status);
    }
  });

  it("refuses unsupported generic finalization statuses explicitly", async () => {
    const runtime = env();
    const submit = await worker.fetch(new Request("https://registry.example/api/messages", {
      method: "POST",
      headers: { authorization: "Bearer message-token" },
      body: JSON.stringify({
        target_site_id: "site-a",
        source: { kind: "cloudflare_worker", ref: "remote-surface-defer" },
        idempotency_key: "remote-surface:defer",
        kind: "observation",
        body: "Defer me.",
        payload: {},
      }),
    }), runtime);
    const messageId = ((await submit.json()) as { message: { message_id: string } }).message.message_id;
    const deferred = await worker.fetch(new Request(`https://registry.example/api/messages/${messageId}/finalize`, {
      method: "POST",
      headers: { authorization: "Bearer finalize-token" },
      body: JSON.stringify({
        schema: "narada.remote_candidate.finalize.v0",
        status: "deferred",
        local_decision_ref: "admission-ledger:decision-1",
      }),
    }), runtime);
    const body = await deferred.json() as { refusal_reasons: string[]; admits_inbox: boolean };

    expect(deferred.status).toBe(400);
    expect(body.refusal_reasons).toContain("remote_candidate_finalize_status_unsupported:deferred");
    expect(body.admits_inbox).toBe(false);
  });

  it("refuses remote messages with raw secret markers without storing them", async () => {
    const runtime = env();
    const response = await worker.fetch(new Request("https://registry.example/api/messages", {
      method: "POST",
      headers: { authorization: "Bearer message-token" },
      body: JSON.stringify({
        target_site_id: "site-a",
        source: { kind: "cloudflare_worker", ref: "remote-surface" },
        idempotency_key: "remote-surface:secret",
        kind: "observation",
        body: "Do not store this.",
        payload: { password: "raw-secret" },
      }),
    }), runtime);
    const text = JSON.stringify(await response.json());
    const d1 = runtime.NARADA_SITE_REGISTRY_D1 as unknown as FakeD1;

    expect(response.status).toBe(400);
    expect(text).toContain("remote_message_payload_contains_raw_secret_marker");
    expect(text).not.toContain("raw-secret");
    expect(d1.messages.size).toBe(0);
  });
});
