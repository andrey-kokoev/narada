/** Cloudflare-native transport and gateway wiring for invokable intelligence. */

import { D1MaterializationStore } from "@narada2/invokable-intelligence-materialization/d1";
import {
  latestCatalogRecords,
  type AuthoritativeDecisionClock,
  type CredentialLocator,
  type InferenceAdapter as CatalogInferenceAdapter,
  type InvocationAuthorityBinding,
  type ResourceRef,
} from "@narada2/invokable-intelligence-contract";
import { D1RegistryStore } from "@narada2/invokable-intelligence-registry/d1";
import {
  buildResolverContext,
  createLocalInvocationGateway,
  type AdapterInvocation,
  type AdapterOutcome,
  type InvokeRequest,
  type InvocationAdapter,
  type LocalInvocationGateway,
  type ResultPayloadPolicyDecision,
} from "./index.js";

export interface CloudflareD1PreparedStatement {
  bind(...params: unknown[]): CloudflareD1PreparedStatement;
    all<T = unknown>(): Promise<{ results: T[] }>;
    first<T = unknown>(): Promise<T | null>;
    run(): Promise<unknown>;
}

export interface CloudflareD1Binding {
  prepare(sql: string): CloudflareD1PreparedStatement;
  batch(statements: CloudflareD1PreparedStatement[]): Promise<unknown[]>;
}

export interface CloudflareAiBinding {
  run(model: string, input: unknown): Promise<unknown>;
}

const MAX_PROVIDER_RESPONSE_BYTES = 4 * 1024 * 1024;

export interface CloudflareInvocationAdmission {
  principalId: string;
  authorityBinding: InvocationAuthorityBinding;
  targetSite: ResourceRef;
  userSite: ResourceRef;
  hostSite: ResourceRef;
  access: Record<string, unknown>;
  catalogRecords: unknown[];
}

export interface CloudflareInvocationGatewayOptions {
  registryDb: CloudflareD1Binding;
  materializationDb?: CloudflareD1Binding;
  runtimeCapabilities?: { aiBinding: boolean; outboundFetch: boolean };
  adapterFor: (adapter: CatalogInferenceAdapter, store: D1RegistryStore) => InvocationAdapter | null | undefined;
  admitRequest(store: D1RegistryStore, request: InvokeRequest): Promise<CloudflareInvocationAdmission>;
  assertReady?: (store: D1RegistryStore) => void | Promise<void>;
  topologyObservationsFor?: (input: {
    records: unknown[];
    clock: AuthoritativeDecisionClock;
    admission: CloudflareInvocationAdmission;
  }) => unknown[];
  clock?: () => AuthoritativeDecisionClock;
  auditAuthority?: { admittedBy: string; admissionRef: string };
  resultPayloadPolicy?: (input: {
    request: InvokeRequest;
    intent: unknown;
    plan: any;
    response: unknown;
    digest: string;
    producedAt: string;
  }) => ResultPayloadPolicyDecision | Promise<ResultPayloadPolicyDecision>;
}

export interface CloudflareInvocationGatewayHandle {
  gateway: LocalInvocationGateway;
  store: D1RegistryStore;
  materialization: D1MaterializationStore;
}

function cloudflareClock(date = new Date()): AuthoritativeDecisionClock {
  const instant = date.toISOString();
  return {
    source: "execution-site-clock",
    authority_ref: "runtime:cloudflare-host",
    instant,
    timezone: "UTC",
    local: {
      date: instant.slice(0, 10),
      time: instant.slice(11, 19),
      weekday: date.getUTCDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    },
  };
}

function catalogEvidenceReference(records: unknown[]): string {
  const references = latestCatalogRecords(records as any[])
    .flatMap((record: any) => record.validation?.evidence ?? [])
    .map(({ ref }: { ref: unknown }) => ref)
    .filter((ref: unknown): ref is string => typeof ref === "string" && ref.includes("invokable-intelligence"));
  return references.sort((left, right) => right.localeCompare(left))[0]
    ?? "cloudflare-d1:invokable-intelligence:catalog-unavailable";
}

function defaultAccessContext(): Record<string, unknown> {
  return {
    action: "invoke",
    requested_region: "global",
    data_classification: "internal",
    requested_retention_days: 0,
    provider_training: "prohibited",
    expected_usage: { amount: 1, unit: "requests" },
    expected_cost: { amount: 0, currency: "USD" },
  };
}

/**
 * Build topology evidence from the runtime capabilities actually present in
 * the Worker. This is evidence, not selection: the catalog still owns the
 * route and all model/provider relationships.
 */
export function cloudflareTopologyObservations(
  records: unknown[],
  clock: AuthoritativeDecisionClock,
  capabilities: { aiBinding: boolean; outboundFetch: boolean },
): unknown[] {
  const windowMs = 5 * 60 * 1000;
  const observedMs = Math.floor(Date.parse(clock.instant) / windowMs) * windowMs;
  const observedAt = new Date(observedMs).toISOString();
  const validUntil = new Date(observedMs + windowMs).toISOString();
  const observations: unknown[] = [];
  const canonicalRecords = latestCatalogRecords(records as any[]);
  for (const record of canonicalRecords) {
    const route = record.document;
    if (route?.schema !== "narada.invokable-intelligence.invocation-route-candidate.v1") continue;
    const components = [
      ...(route.topology?.nodes ?? []).map((component: any) => ({ subject: { kind: "node", id: component.id }, component })),
      ...(route.topology?.edges ?? []).map((component: any) => ({ subject: { kind: "edge", id: component.id }, component })),
    ];
    for (const { subject, component } of components) {
      const runtimeBinding = asRecord(component.runtime_binding);
      const runtimeAvailable = runtimeBinding.kind === "cloudflare-binding" && runtimeBinding.name === "AI"
        ? capabilities.aiBinding
        : runtimeBinding.kind === "outbound-fetch"
          ? capabilities.outboundFetch
          : false;
      for (const requirement of component.required_feasibility ?? []) {
        const available = requirement === "adapter-supported"
          || requirement === "service-available"
          || requirement === "endpoint-available"
          ? runtimeAvailable
          : requirement === "client-supported"
            || requirement === "launcher-available"
            || requirement === "network-reachable"
            || requirement === "carrier-deployed"
            || requirement === "runtime-available"
            || requirement === "boundary-admitted"
            ? true
            : false;
        observations.push({
          schema: "narada.invokable-intelligence.topology-feasibility.v1",
          id: `topology-observation:${route.topology.id}:${subject.kind}:${subject.id}:${requirement}:${observedAt}`,
          topology_id: route.topology.id,
          subject,
          requirement,
          status: available ? "feasible" : "infeasible",
          owner: { ...(component.feasibility_authority ?? { kind: "cloudflare-host", id: "runtime" }) },
          validity: { valid_from: observedAt, valid_until: validUntil, fresh_as_of: observedAt },
          observed_at: observedAt,
          evidence: [
            { kind: "run", ref: "cloudflare-runtime:request-admitted", evidence_class: "observed" },
            { kind: "artifact", ref: capabilities.aiBinding ? "cloudflare-worker-binding:AI" : "cloudflare-worker:fetch", evidence_class: "observed" },
            { kind: "document", ref: catalogEvidenceReference(canonicalRecords), evidence_class: "durable" },
          ],
          reason_code: available ? "cloudflare-runtime-capability-present" : "cloudflare-runtime-capability-missing",
        });
      }
    }
  }
  return observations;
}

/**
 * Shared D1-backed gateway construction. Carrier and NARS provide different
 * admission callbacks, but they use the same resolver, materialization,
 * idempotency, credential-locator, and evidence boundary.
 */
export async function createCloudflareInvocationGateway(
  options: CloudflareInvocationGatewayOptions,
): Promise<CloudflareInvocationGatewayHandle> {
  const store = await D1RegistryStore.open(options.registryDb);
  let materialization: D1MaterializationStore | null = null;
  try {
    materialization = await D1MaterializationStore.open(options.materializationDb ?? options.registryDb);
    const records = await store.listCatalogRecords();
    await options.assertReady?.(store);
    const clock = options.clock ?? (() => cloudflareClock());
    const runtimeCapabilities = options.runtimeCapabilities ?? { aiBinding: false, outboundFetch: true };
    const auditAuthority = options.auditAuthority ?? {
      admittedBy: "runtime:cloudflare-host",
      admissionRef: "runtime-boundary:cloudflare-host",
    };
    const admissionCache = new Map<string, Promise<CloudflareInvocationAdmission>>();
    const admissionKey = (request: InvokeRequest): string | null => request.operationId ?? request.intentId ?? request.idempotencyKey ?? null;
    const admittedFor = (request: InvokeRequest): Promise<CloudflareInvocationAdmission> => {
      const key = admissionKey(request);
      if (!key) return options.admitRequest(store, request);
      const existing = admissionCache.get(key);
      if (existing) return existing;
      const admitted = options.admitRequest(store, request);
      admissionCache.set(key, admitted);
      return admitted;
    };
    const canonicalGateway = createLocalInvocationGateway({
      store,
      adapterFor: (adapter) => options.adapterFor(adapter, store),
      clock,
      contextFor: async ({ request, clock: decisionClock }) => {
        const admitted = await admittedFor(request);
        return buildResolverContext(
          { targetSite: admitted.targetSite, userSite: admitted.userSite, hostSite: admitted.hostSite },
          {
            clock: decisionClock,
            runtime: "workers",
            access: admitted.access as any,
            topologyObservations: (options.topologyObservationsFor
              ? options.topologyObservationsFor({
                  records: admitted.catalogRecords.length > 0 ? admitted.catalogRecords : records,
                  clock: decisionClock,
                  admission: admitted,
                })
              : cloudflareTopologyObservations(
                  admitted.catalogRecords.length > 0 ? admitted.catalogRecords : records,
                  decisionClock,
                  runtimeCapabilities,
                )) as any,
          },
        );
      },
      materializationFor: async ({ intent, context }) => materialization!.acquire({
        destination_site_id: context.targetSite.id,
        resolver: "cloudflare",
        target_site_id: context.targetSite.id,
        purpose: intent.purpose,
        ...(intent.principal ? { principal_id: intent.principal } : {}),
        now: context.clock.instant,
      }),
      auditAuthority,
      resultPayloadPolicy: async ({ request, intent, plan, response, digest, producedAt }) => {
        const admitted = await admittedFor(request);
        return options.resultPayloadPolicy
          ? options.resultPayloadPolicy({ request, intent, plan, response, digest, producedAt })
          : {
              media_type: "application/json",
              classification: (String((admitted.access as any).data_classification ?? "internal") as ResultPayloadPolicyDecision["classification"]),
              retention: { mode: "never-retain", policy_ref: plan.access.governance_requirement_ids?.[0] ?? "cloudflare-runtime-default", residency: admitted.hostSite.id },
              access: { allowed_principals: intent.principal ? [intent.principal] : [], capability_refs: ["capability:invocation-result-read"] },
              disposition: "never-retained",
              tombstone: { disposed_at: producedAt, reason_code: "runtime-result-never-retain", evidence_ref: auditAuthority.admissionRef },
            };
      },
    });
    const gateway: LocalInvocationGateway = {
      async invoke(request) {
        const key = admissionKey(request);
        const admitted = await admittedFor(request);
        try {
          return await canonicalGateway.invoke({
            ...request,
            principal: admitted.principalId,
            authorityBinding: admitted.authorityBinding,
          });
        } finally {
          if (key) admissionCache.delete(key);
        }
      },
    };
    return { gateway, store, materialization };
  } catch (error) {
    await Promise.allSettled([
      ...(materialization ? [materialization.close()] : []),
      store.close(),
    ]);
    throw error;
  }
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" ? value as Record<string, any> : {};
}

function clampTimeout(value: unknown, fallback = 15000): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.max(1000, Math.min(120000, parsed)) : fallback;
}

function textValue(value: unknown): string {
  if (typeof value === "string") return value;
  const record = asRecord(value);
  return typeof record.value === "string" ? record.value : "";
}

function contentText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(contentText).join("");
  const record = asRecord(value);
  return textValue(record.text) || textValue(record.value);
}

function extractText(value: unknown): string {
  const record = asRecord(value);
  const output = Array.isArray(record.output) ? record.output : [];
  const outputText = output
    .map((item: any) => contentText(item?.content ?? item?.text ?? item))
    .join("");
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const choiceText = choices
    .map((choice: any) => contentText(choice?.message?.content ?? choice?.text))
    .join("");
  return [record.response, record.output_text, record.text, record.result]
    .map(textValue)
    .find((candidate) => candidate.length > 0)
    ?? (choiceText || outputText);
}

function extractToolCalls(value: unknown): unknown[] {
  const record = asRecord(value);
  if (Array.isArray(record.tool_calls)) return record.tool_calls;
  if (Array.isArray(record.choices)) return record.choices.flatMap((choice: any) => choice?.message?.tool_calls ?? []);
  return [];
}

function responsePayload(value: unknown): Record<string, unknown> {
  return { text: extractText(value), tool_calls: extractToolCalls(value), raw_provider_response: value };
}

function validateProviderResponse(value: unknown): { ok: true; payload: Record<string, unknown> } | { ok: false; code: string; message: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, code: "cloudflare_provider_response_invalid", message: "The provider returned a non-object response." };
  }
  const payload = responsePayload(value);
  const text = payload.text;
  const toolCalls = payload.tool_calls;
  if (typeof text !== "string" || (text.length === 0 && (!Array.isArray(toolCalls) || toolCalls.length === 0))) {
    return { ok: false, code: "cloudflare_provider_response_empty", message: "The provider response contained neither assistant text nor tool calls." };
  }
  return { ok: true, payload };
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PROVIDER_RESPONSE_BYTES) {
    throw new Error("cloudflare_provider_response_too_large");
  }
  const body = await response.text();
  if (new TextEncoder().encode(body).byteLength > MAX_PROVIDER_RESPONSE_BYTES) {
    throw new Error("cloudflare_provider_response_too_large");
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("cloudflare_provider_response_not_json");
  }
}

function abortablePromise<T>(promise: Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("cloudflare_provider_timeout"));
    }, timeoutMs);
    const abort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error("cloudflare_provider_aborted"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    promise.then((value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      resolve(value);
    }, (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(error);
    });
  });
}

export interface CloudflareProviderAdapterOptions {
  ai?: CloudflareAiBinding;
  fetch?: typeof fetch;
  resolveCredential?: (credential: CredentialLocator) => Promise<string | null> | string | null;
  defaultTools?: unknown[];
}

/**
 * Adapter for catalog-selected Cloudflare Workers AI or an explicitly
 * catalog-selected HTTPS endpoint. No model or provider is chosen here.
 */
export function createCloudflareProviderAdapter(options: CloudflareProviderAdapterOptions): InvocationAdapter {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  return {
    async invoke(input: AdapterInvocation): Promise<AdapterOutcome> {
      const protocol = input.adapter.protocol;
      const timeoutMs = clampTimeout((input.plan.options as any)?.timeout_ms);
      const body = input.messages && typeof input.messages === "object" && !Array.isArray(input.messages)
        ? asRecord(input.messages)
        : { messages: input.messages };
      const messages = body.messages ?? input.messages ?? [];
      const tools = body.tools ?? input.tools ?? options.defaultTools ?? [];
      const payload = { ...body, messages, tools, model: input.offering.invocation_model_key };

      if (protocol.family === "cloudflare-workers-ai") {
        if (!options.ai || typeof options.ai.run !== "function") {
          return { error: { code: "cloudflare_workers_ai_binding_missing", message: "The catalog-selected Workers AI adapter has no AI binding.", retryable: false }, admission: "not-acknowledged", transportSubmitted: false };
        }
        try {
          const response = await abortablePromise(options.ai.run(input.offering.invocation_model_key, payload), timeoutMs, input.abortSignal);
          const validated = validateProviderResponse(response);
          if (!validated.ok) return { error: { ...validated, retryable: false }, admission: "acknowledged", transportSubmitted: true };
          return { response: validated.payload, admission: "acknowledged", transportSubmitted: true, providerRequestRef: String(asRecord(response).request_id ?? "") || undefined };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { error: { code: message === "cloudflare_provider_timeout" ? "cloudflare_workers_ai_timeout" : "cloudflare_workers_ai_provider_failed", message, retryable: message !== "cloudflare_provider_aborted" }, admission: "uncertain", transportSubmitted: true };
        }
      }

      if (input.endpoint.address.kind !== "url" || typeof fetchImpl !== "function") {
        return { error: { code: "cloudflare_endpoint_not_fetchable", message: `The catalog endpoint for '${input.adapter.id}' is not an HTTPS URL reachable by the Worker.`, retryable: false }, admission: "not-acknowledged", transportSubmitted: false };
      }
      let endpointUrl: URL;
      try {
        endpointUrl = new URL(input.endpoint.address.url);
      } catch {
        return { error: { code: "cloudflare_endpoint_url_invalid", message: `The catalog endpoint for '${input.adapter.id}' is not a valid URL.`, retryable: false }, admission: "not-acknowledged", transportSubmitted: false };
      }
      if (endpointUrl.protocol !== "https:") {
        return { error: { code: "cloudflare_endpoint_https_required", message: `The catalog endpoint for '${input.adapter.id}' must use HTTPS.`, retryable: false }, admission: "not-acknowledged", transportSubmitted: false };
      }
      let credentialValue: string | null = null;
      if (input.credential && input.credential.store !== "none") {
        credentialValue = options.resolveCredential ? await options.resolveCredential(input.credential) : null;
        if (!credentialValue) {
          return { error: { code: "cloudflare_credential_materialization_unavailable", message: `Credential locator '${input.credential.id}' was admitted but no Cloudflare secret resolver supplied it.`, retryable: false }, admission: "not-acknowledged", transportSubmitted: false };
        }
      }
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (credentialValue) headers[protocol.family === "anthropic" ? "x-api-key" : "authorization"] = protocol.family === "anthropic" ? credentialValue : `Bearer ${credentialValue}`;
      try {
        const response = await abortablePromise(fetchImpl(endpointUrl, { method: "POST", headers, body: JSON.stringify(payload), signal: input.abortSignal }), timeoutMs, input.abortSignal);
        if (!response.ok) return { error: { code: "cloudflare_provider_http_error", message: `Provider returned HTTP ${response.status}.`, retryable: response.status >= 500 }, admission: "acknowledged", transportSubmitted: true };
        const responseBody = await readJsonResponse(response);
        const validated = validateProviderResponse(responseBody);
        if (!validated.ok) return { error: { ...validated, retryable: false }, admission: "acknowledged", transportSubmitted: true };
        return { response: validated.payload, admission: "acknowledged", transportSubmitted: true, providerRequestRef: response.headers.get("x-request-id") ?? undefined };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const responseCode = message.startsWith("cloudflare_provider_response_") ? message : "cloudflare_provider_fetch_failed";
        return { error: { code: responseCode, message, retryable: responseCode === "cloudflare_provider_fetch_failed" }, admission: "uncertain", transportSubmitted: true };
      }
    },
  };
}
