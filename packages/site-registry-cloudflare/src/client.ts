import {
  preflightSiteTelemetryPublicationEdge,
  type SiteEventEnvelope,
  type SiteEventFamily,
  type SiteTelemetryPublicationEdge,
} from "@narada2/site-config";
import type {
  RemoteSiteInboxFinalizePayload,
  RemoteSiteInboxMessage,
} from "@narada2/site-inbox";

export interface CapabilityResolver {
  resolveCapability(ref: string): Promise<string> | string;
}

export interface HostedRegistryClientConfig extends CapabilityResolver {
  registryUrl: string;
  publishCapabilityRef: string;
  pollCapabilityRef: string;
  finalizeCapabilityRef: string;
  fetch?: typeof fetch;
}

export interface BuildSiteEventInput {
  event_id: string;
  idempotency_key: string;
  source_site_id: string;
  subject_site_id?: string;
  target_site_id?: string;
  family: SiteEventFamily;
  type: string;
  observed_at: string;
  sent_at: string;
  payload_summary: Record<string, unknown>;
  max_payload_bytes?: number;
  authority_limits?: string[];
}

export interface PublishSiteEventInput extends BuildSiteEventInput {
  dryRun?: boolean;
}

export interface PublishSiteEventWithPublicationEdgeInput extends BuildSiteEventInput {
  publicationEdge: SiteTelemetryPublicationEdge;
  dryRun?: boolean;
  expectedSurfaceId?: string;
  credentialRefStatus?: "fresh" | "stale" | "missing" | "revoked" | "unknown";
}

export interface PublicationEdgePublisherConfig extends CapabilityResolver {
  fetch?: typeof fetch;
}

export interface PullHostedMessagesInput {
  dryRun?: boolean;
  admitMessage?: (message: RemoteSiteInboxMessage) => Promise<RemoteSiteInboxFinalizePayload> | RemoteSiteInboxFinalizePayload;
}

export function buildBoundedSiteEvent(input: BuildSiteEventInput, capabilityRef: string): SiteEventEnvelope {
  if (containsRawSecretMarker(input.payload_summary)) {
    throw new Error("site_event_payload_summary_contains_raw_secret_marker");
  }
  return {
    schema: "narada.site_event.envelope.v0",
    event_id: input.event_id,
    idempotency_key: input.idempotency_key,
    source_site_id: input.source_site_id,
    ...(input.subject_site_id ? { subject_site_id: input.subject_site_id } : {}),
    ...(input.target_site_id ? { target_site_id: input.target_site_id } : {}),
    family: input.family,
    type: input.type,
    observed_at: input.observed_at,
    sent_at: input.sent_at,
    auth: {
      kind: "bearer_capability_ref",
      capability_ref: capabilityRef,
      authenticated: false,
    },
    payload_bounds: {
      max_bytes: input.max_payload_bytes ?? byteLength(input.payload_summary),
      raw_values_excluded: true,
    },
    payload_summary: input.payload_summary,
    authority_limits: input.authority_limits ?? [
      "site_event_is_projection_input_not_site_authority",
      "site_event_does_not_include_raw_logs_or_secrets",
    ],
  };
}

export function buildBoundedSiteEventFromPublicationEdge(input: PublishSiteEventWithPublicationEdgeInput): SiteEventEnvelope {
  assertPublicationEdgeAllowsEvent(input);
  return buildBoundedSiteEvent({
    event_id: input.event_id,
    idempotency_key: input.idempotency_key,
    source_site_id: input.source_site_id,
    subject_site_id: input.subject_site_id,
    target_site_id: input.target_site_id,
    family: input.family,
    type: input.type,
    observed_at: input.observed_at,
    sent_at: input.sent_at,
    payload_summary: input.payload_summary,
    max_payload_bytes: input.max_payload_bytes,
    authority_limits: input.authority_limits,
  }, input.publicationEdge.capability_refs.publish ?? "");
}

export async function publishBoundedSiteEvent(config: HostedRegistryClientConfig, input: PublishSiteEventInput) {
  const event = buildBoundedSiteEvent(input, config.publishCapabilityRef);
  const url = new URL("/webhook", config.registryUrl).toString();
  if (input.dryRun) {
    return {
      schema: "narada.site_registry_cloudflare.publish_plan.v0",
      dry_run: true,
      url,
      method: "POST",
      event,
      live_network_performed: false,
      raw_secret_values_recorded: false,
    };
  }

  const token = await config.resolveCapability(config.publishCapabilityRef);
  const response = await (config.fetch ?? fetch)(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(event),
  });
  return {
    schema: "narada.site_registry_cloudflare.publish_result.v0",
    dry_run: false,
    status: response.status,
    response: await response.json(),
    live_network_performed: true,
    raw_secret_values_recorded: false,
  };
}

export async function publishBoundedSiteEventWithPublicationEdge(
  config: PublicationEdgePublisherConfig,
  input: PublishSiteEventWithPublicationEdgeInput,
) {
  const event = buildBoundedSiteEventFromPublicationEdge(input);
  const url = publicationEdgeEndpointUrl(input.publicationEdge);
  if (input.dryRun) {
    return {
      schema: "narada.site_registry_cloudflare.publication_edge_publish_plan.v0",
      dry_run: true,
      publication_edge_id: input.publicationEdge.edge_id,
      surface_id: input.publicationEdge.surface_id,
      url,
      method: "POST",
      event,
      live_network_performed: false,
      raw_secret_values_recorded: false,
    };
  }

  const capabilityRef = input.publicationEdge.capability_refs.publish;
  if (!capabilityRef) throw new Error("publication_edge_publish_capability_missing");
  const token = await config.resolveCapability(capabilityRef);
  const response = await (config.fetch ?? fetch)(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(event),
  });
  return {
    schema: "narada.site_registry_cloudflare.publication_edge_publish_result.v0",
    dry_run: false,
    publication_edge_id: input.publicationEdge.edge_id,
    status: response.status,
    response: await response.json(),
    live_network_performed: true,
    raw_secret_values_recorded: false,
  };
}

export async function pullHostedMessages(config: HostedRegistryClientConfig, input: PullHostedMessagesInput = {}) {
  const fetchImpl = config.fetch ?? fetch;
  const pollUrl = new URL("/api/messages/pending", config.registryUrl).toString();
  if (input.dryRun) {
    return {
      schema: "narada.site_registry_cloudflare.pull_plan.v0",
      dry_run: true,
      poll_url: pollUrl,
      live_network_performed: false,
      local_inbox_mutated: false,
      remote_finalized: false,
    };
  }

  const pollToken = await config.resolveCapability(config.pollCapabilityRef);
  const pendingResponse = await fetchImpl(pollUrl, {
    headers: { authorization: `Bearer ${pollToken}` },
  });
  const pending = await pendingResponse.json() as {
    messages?: Array<{ message: RemoteSiteInboxMessage }>;
  };
  const messages = pending.messages?.map((entry) => entry.message) ?? [];
  const finalized: Array<{ message_id: string; status: RemoteSiteInboxFinalizePayload["status"]; response_status: number }> = [];

  if (input.admitMessage) {
    const finalizeToken = await config.resolveCapability(config.finalizeCapabilityRef);
    for (const message of messages) {
      const finalize = await input.admitMessage(message);
      const finalizeUrl = new URL(`/api/messages/${encodeURIComponent(message.message_id)}/finalize`, config.registryUrl).toString();
      const response = await fetchImpl(finalizeUrl, {
        method: "POST",
        headers: {
          authorization: `Bearer ${finalizeToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(finalize),
      });
      finalized.push({ message_id: message.message_id, status: finalize.status, response_status: response.status });
    }
  }

  return {
    schema: "narada.site_registry_cloudflare.pull_result.v0",
    dry_run: false,
    pending_count: messages.length,
    finalized,
    live_network_performed: true,
    local_inbox_mutated: false,
    remote_finalized: finalized.length > 0,
  };
}

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function assertPublicationEdgeAllowsEvent(input: PublishSiteEventWithPublicationEdgeInput): void {
  const preflight = preflightSiteTelemetryPublicationEdge(input.publicationEdge, {
    expected_surface_id: input.expectedSurfaceId ?? input.publicationEdge.surface_id,
    credential_ref_status: input.credentialRefStatus ?? input.publicationEdge.rotation_posture.credential_ref_status,
  });
  if (preflight.status !== "pass") {
    const failures = preflight.checks
      .filter((check) => check.status === "fail")
      .map((check) => check.failure ?? check.name);
    throw new Error(failures[0] ?? "publication_edge_preflight_failed");
  }
  if (!input.publicationEdge.accepted_event_families.includes(input.family)) {
    throw new Error("publication_edge_event_family_not_allowed");
  }
}

function publicationEdgeEndpointUrl(edge: SiteTelemetryPublicationEdge): string {
  if (edge.surface_endpoint.kind !== "https" && edge.surface_endpoint.kind !== "local_http") {
    throw new Error("publication_edge_endpoint_not_http");
  }
  if (!edge.surface_endpoint.url) throw new Error("publication_edge_endpoint_missing");
  return new URL("/webhook", edge.surface_endpoint.url).toString();
}

function containsRawSecretMarker(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsRawSecretMarker);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, child]) => {
    const normalized = key.toLowerCase();
    return normalized.includes("secret")
      || normalized.includes("password")
      || normalized.includes("token")
      || normalized.includes("api_key")
      || containsRawSecretMarker(child);
  });
}
