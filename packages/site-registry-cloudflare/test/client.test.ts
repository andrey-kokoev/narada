import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildBoundedSiteEvent,
  buildBoundedSiteEventFromPublicationEdge,
  publishBoundedSiteEvent,
  publishBoundedSiteEventWithPublicationEdge,
  pullHostedMessages,
  type PublicationEdgePublisherConfig,
  type HostedRegistryClientConfig,
} from "../src/client.js";
import type { SiteTelemetryPublicationEdge } from "@narada2/site-config";

function config(fetchImpl?: typeof fetch): HostedRegistryClientConfig {
  const capabilityValues: Record<string, string> = {
    "capability:publish": "publish-token",
    "capability:poll": "poll-token",
    "capability:finalize": "finalize-token",
  };
  return {
    registryUrl: "https://registry.example",
    publishCapabilityRef: "capability:publish",
    pollCapabilityRef: "capability:poll",
    finalizeCapabilityRef: "capability:finalize",
    fetch: fetchImpl,
    resolveCapability(ref: string) {
      return capabilityValues[ref] ?? "";
    },
  };
}

function edge(overrides: Partial<SiteTelemetryPublicationEdge> = {}): SiteTelemetryPublicationEdge {
  return {
    ...JSON.parse(readFileSync(new URL("../../../docs/product/fixtures/site-telemetry-publication-edge/publication-edge.valid.json", import.meta.url), "utf8")),
    ...overrides,
  } as SiteTelemetryPublicationEdge;
}

describe("@narada2/site-registry-cloudflare client helpers", () => {
  it("builds bounded Site events without raw logs, secrets, or task DB dumps", () => {
    const event = buildBoundedSiteEvent({
      event_id: "evt-1",
      idempotency_key: "site-a:evt-1",
      source_site_id: "site-a",
      family: "site_health",
      type: "site.health.observed",
      observed_at: "2026-05-16T16:45:00.000Z",
      sent_at: "2026-05-16T16:45:01.000Z",
      payload_summary: { status: "ok", evidence_ref: "local:health:1" },
    }, "capability:publish");

    expect(event.schema).toBe("narada.site_event.envelope.v0");
    expect(event.auth.capability_ref).toBe("capability:publish");
    expect(event.auth.authenticated).toBe(false);
    expect(event.payload_bounds.raw_values_excluded).toBe(true);
    expect(JSON.stringify(event)).not.toContain("task-lifecycle.db");
  });

  it("refuses raw secret markers before publishing", () => {
    expect(() => buildBoundedSiteEvent({
      event_id: "evt-1",
      idempotency_key: "site-a:evt-1",
      source_site_id: "site-a",
      family: "site_health",
      type: "site.health.observed",
      observed_at: "2026-05-16T16:45:00.000Z",
      sent_at: "2026-05-16T16:45:01.000Z",
      payload_summary: { api_token: "raw" },
    }, "capability:publish")).toThrow("site_event_payload_summary_contains_raw_secret_marker");
  });

  it("builds bounded events from Publication Edge descriptors without resolving raw secrets", () => {
    const event = buildBoundedSiteEventFromPublicationEdge({
      publicationEdge: edge(),
      event_id: "evt-edge",
      idempotency_key: "site-a:evt-edge",
      source_site_id: "narada-proper",
      family: "site_health",
      type: "site.health.observed",
      observed_at: "2026-05-16T20:00:00.000Z",
      sent_at: "2026-05-16T20:00:01.000Z",
      payload_summary: { status: "ok" },
    });

    expect(event.auth.capability_ref).toBe("capability:site_telemetry.publish.narada-proper");
    expect(event.auth.authenticated).toBe(false);
    expect(event.payload_bounds.raw_values_excluded).toBe(true);
  });

  it("dry-runs Publication Edge publishing without network or capability resolution", async () => {
    let resolved = false;
    let fetched = false;
    const result = await publishBoundedSiteEventWithPublicationEdge({
      resolveCapability() {
        resolved = true;
        return "raw-token";
      },
      fetch: (async () => {
        fetched = true;
        return Response.json({});
      }) as typeof fetch,
    }, {
      dryRun: true,
      publicationEdge: edge(),
      event_id: "evt-edge",
      idempotency_key: "site-a:evt-edge",
      source_site_id: "narada-proper",
      family: "site_health",
      type: "site.health.observed",
      observed_at: "2026-05-16T20:00:00.000Z",
      sent_at: "2026-05-16T20:00:01.000Z",
      payload_summary: { status: "ok" },
    });

    expect(result.dry_run).toBe(true);
    expect(result.live_network_performed).toBe(false);
    expect(resolved).toBe(false);
    expect(fetched).toBe(false);
    expect(JSON.stringify(result)).not.toContain("raw-token");
  });

  it("rejects Publication Edge family and preflight failures before network transport", async () => {
    const publisher: PublicationEdgePublisherConfig = {
      resolveCapability() {
        throw new Error("should_not_resolve");
      },
      fetch: (async () => {
        throw new Error("should_not_fetch");
      }) as typeof fetch,
    };
    const base = {
      publicationEdge: edge({ accepted_event_families: ["site_health"] }),
      event_id: "evt-edge",
      idempotency_key: "site-a:evt-edge",
      source_site_id: "narada-proper",
      type: "site.health.observed",
      observed_at: "2026-05-16T20:00:00.000Z",
      sent_at: "2026-05-16T20:00:01.000Z",
      payload_summary: { status: "ok" },
    } as const;

    expect(() => buildBoundedSiteEventFromPublicationEdge({
      ...base,
      family: "report",
    })).toThrow("publication_edge_event_family_not_allowed");

    await expect(publishBoundedSiteEventWithPublicationEdge(publisher, {
      ...base,
      publicationEdge: edge({ rotation_posture: { credential_ref_status: "stale" } }),
      family: "site_health",
    })).rejects.toThrow("publication_edge_credential_ref_stale");
  });

  it("resolves Publication Edge capability only at transport time", async () => {
    const requests: Request[] = [];
    const result = await publishBoundedSiteEventWithPublicationEdge({
      resolveCapability(ref: string) {
        expect(ref).toBe("capability:site_telemetry.publish.narada-proper");
        return "publish-token";
      },
      fetch: (async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({ status: "accepted" }, { status: 202 });
      }) as typeof fetch,
    }, {
      publicationEdge: edge(),
      event_id: "evt-edge",
      idempotency_key: "site-a:evt-edge",
      source_site_id: "narada-proper",
      family: "site_health",
      type: "site.health.observed",
      observed_at: "2026-05-16T20:00:00.000Z",
      sent_at: "2026-05-16T20:00:01.000Z",
      payload_summary: { status: "ok" },
    });

    expect(result.status).toBe(202);
    expect(requests.length).toBe(1);
    expect(requests[0].url).toBe("https://telemetry.example/webhook");
    expect(requests[0].headers.get("authorization")).toBe("Bearer publish-token");
    expect(JSON.stringify(result)).not.toContain("publish-token");
  });

  it("supports dry-run publishing without live network or raw secret output", async () => {
    let called = false;
    const result = await publishBoundedSiteEvent(config((async () => {
      called = true;
      return new Response("{}");
    }) as typeof fetch), {
      dryRun: true,
      event_id: "evt-1",
      idempotency_key: "site-a:evt-1",
      source_site_id: "site-a",
      family: "site_health",
      type: "site.health.observed",
      observed_at: "2026-05-16T16:45:00.000Z",
      sent_at: "2026-05-16T16:45:01.000Z",
      payload_summary: { status: "ok" },
    });

    expect(called).toBe(false);
    expect(result.dry_run).toBe(true);
    expect(result.live_network_performed).toBe(false);
    expect(JSON.stringify(result)).not.toContain("publish-token");
  });

  it("publishes through mocked fetch using capability resolver tokens only at transport time", async () => {
    const requests: Request[] = [];
    const result = await publishBoundedSiteEvent(config((async (input, init) => {
      requests.push(new Request(input, init));
      return Response.json({ status: "accepted" }, { status: 202 });
    }) as typeof fetch), {
      event_id: "evt-1",
      idempotency_key: "site-a:evt-1",
      source_site_id: "site-a",
      family: "site_health",
      type: "site.health.observed",
      observed_at: "2026-05-16T16:45:00.000Z",
      sent_at: "2026-05-16T16:45:01.000Z",
      payload_summary: { status: "ok" },
    });

    expect(requests.length).toBe(1);
    expect(requests[0].url).toBe("https://registry.example/webhook");
    expect(requests[0].headers.get("authorization")).toBe("Bearer publish-token");
    expect(result.status).toBe(202);
    expect(JSON.stringify(result)).not.toContain("publish-token");
  });

  it("dry-runs hosted message pulling without network, finalization, or local inbox mutation", async () => {
    let called = false;
    const result = await pullHostedMessages(config((async () => {
      called = true;
      return new Response("{}");
    }) as typeof fetch), { dryRun: true });

    expect(called).toBe(false);
    expect(result.dry_run).toBe(true);
    expect(result.live_network_performed).toBe(false);
    expect(result.local_inbox_mutated).toBe(false);
    expect(result.remote_finalized).toBe(false);
  });

  it("pulls pending messages and finalizes only after local admission callback returns evidence", async () => {
    const requests: Request[] = [];
    const result = await pullHostedMessages(config((async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      if (request.url.endsWith("/api/messages/pending")) {
        return Response.json({
          messages: [{
            message: {
              schema: "narada.site_inbox.remote_message.v0",
              message_id: "msg-1",
              target_site_id: "site-a",
              status: "pending",
              source: { kind: "cloudflare_worker", ref: "remote-surface" },
              idempotency_key: "remote-surface:1",
              kind: "observation",
              body: "Review this.",
              payload: {},
              received_at: "2026-05-16T16:45:00.000Z",
              receipt: {
                schema: "narada.site_inbox.remote_message_receipt.v0",
                receipt_id: "remote-site-inbox-receipt:msg-1",
                message_id: "msg-1",
                status: "pending",
                remote_received: {
                  received_at: "2026-05-16T16:45:00.000Z",
                  source_ref: "remote-surface",
                  idempotency_key: "remote-surface:1",
                },
              },
            },
          }],
        });
      }
      return Response.json({ status: "admitted" });
    }) as typeof fetch), {
      admitMessage(message) {
        return {
          schema: "narada.site_inbox.remote_finalize_payload.v0",
          status: "admitted",
          local_site_id: message.target_site_id,
          local_admission_id: "env-msg-1",
          local_kind: message.kind,
          local_admitted_at: "2026-05-16T16:50:00.000Z",
        };
      },
    });

    expect(requests.length).toBe(2);
    expect(requests[0].headers.get("authorization")).toBe("Bearer poll-token");
    expect(requests[1].url).toBe("https://registry.example/api/messages/msg-1/finalize");
    expect(requests[1].headers.get("authorization")).toBe("Bearer finalize-token");
    expect(result.pending_count).toBe(1);
    expect(result.finalized).toEqual([{ message_id: "msg-1", status: "admitted", response_status: 200 }]);
    expect(result.local_inbox_mutated).toBe(false);
  });
});
