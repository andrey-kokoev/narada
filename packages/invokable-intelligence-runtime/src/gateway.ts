/** Canonical invocation gateway shared by local Node and Workers runtimes. */

import { evaluatePlanUse, validateResource } from "@narada2/invokable-intelligence-contract";
import type {
  AuthoritativeDecisionClock,
  CapabilityKey,
  CredentialLocator,
  InferenceAdapter as CatalogInferenceAdapter,
  InferenceEndpoint,
  InferenceProvider,
  InvocationAuditEvidence,
  InvocationExecutionAttempt,
  InvocationExecutionTransition,
  InvocationIntent,
  InvocationObservation,
  InvocationOperationalTelemetry,
  InvocationPlan,
  InvocationRefusal,
  InvocationResultEnvelope,
  InvocationTerminalOutcome,
  Model,
  ModelOffering,
  ModelProvider,
  PayloadAccessPolicy,
  PayloadRetentionPolicy,
  PlanAttemptMode,
  PlanRevalidationEvidence,
  PlanRevalidationTrigger,
  ResolverMaterializedInputs,
  ResourceRef,
  Resource,
  RetainedPayloadRef,
} from "@narada2/invokable-intelligence-contract";
import type { IntelligenceRegistryStore } from "@narada2/invokable-intelligence-registry";
import {
  canonicalJson,
  computeResolverStateDigests,
  deterministicId,
  resolveInvocation,
  sha256Digest,
} from "@narada2/invokable-intelligence-resolver";
import type { ResolverContext } from "@narada2/invokable-intelligence-resolver";

export interface AdapterInvocation {
  plan: InvocationPlan;
  /** Exact immutable catalog revisions bound into the plan snapshot. */
  model: Model;
  modelProvider: ModelProvider;
  offering: ModelOffering;
  inferenceProvider: InferenceProvider;
  endpoint: InferenceEndpoint;
  adapter: CatalogInferenceAdapter;
  /** Opaque caller payload; the gateway never writes it to registry records. */
  messages: unknown;
  tools: unknown;
  abortSignal?: AbortSignal;
  credential: CredentialLocator | null;
  invocationId?: string;
  turnId?: string;
  inputEventId?: string;
  requestId?: string;
  invocationScope?: unknown;
  invocationEventSink?: (event: unknown) => void | Promise<void>;
}

export type AdmissionStatus = "acknowledged" | "not-acknowledged" | "uncertain";

export interface AdapterOutcome {
  response?: unknown;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cached_tokens?: number;
    latency_ms?: number;
    queue_ms?: number;
  };
  error?: { code: string; message: string; retryable?: boolean };
  /** Explicit transport/provider admission knowledge. Errors without this field are conservatively uncertain. */
  admission?: AdmissionStatus;
  /** Whether the adapter observed request bytes crossing its transport boundary. */
  transportSubmitted?: boolean;
  providerRequestRef?: string;
}

export interface InvocationAdapter {
  invoke(input: AdapterInvocation): Promise<AdapterOutcome>;
}

export interface InvokeRequest {
  /** Stable semantic intent identity. Generated from admitted inputs when omitted. */
  intentId?: string;
  /** Stable delivery identity. Reusing it returns the recorded outcome without redispatch. */
  operationId?: string;
  purpose: string;
  principal?: string;
  requiredCapabilities?: CapabilityKey[];
  requestedModel?: ResourceRef;
  requestedOptions?: Record<string, unknown>;
  messages?: unknown;
  tools?: unknown;
  /** Ephemeral cancellation signal; never persisted into intent or evidence records. */
  abortSignal?: AbortSignal;
  /** Caller-supplied digest may avoid hashing a large payload twice. */
  inputDigest?: string;
  mode?: PlanAttemptMode;
  /** False turns stale state into a typed refusal instead of an implicit replacement plan. */
  allowReplan?: boolean;
  invocationId?: string;
  turnId?: string;
  inputEventId?: string;
  requestId?: string;
  invocationScope?: unknown;
  invocationEventSink?: (event: unknown) => void | Promise<void>;
}

export interface ResultPayloadPolicyInput {
  request: InvokeRequest;
  intent: InvocationIntent;
  plan: InvocationPlan;
  response: unknown;
  digest: string;
  producedAt: string;
}

export interface ResultPayloadPolicyDecision {
  media_type: string;
  classification: RetainedPayloadRef["classification"];
  retention: PayloadRetentionPolicy;
  access: PayloadAccessPolicy;
  disposition: RetainedPayloadRef["disposition"];
  storage_ref?: string;
  redaction_profile_ref?: string;
  tombstone?: RetainedPayloadRef["tombstone"];
}

export type GatewayPlanResult = {
  kind: "plan";
  intent: InvocationIntent;
  plan: InvocationPlan;
  attempt: InvocationExecutionAttempt;
  result: InvocationResultEnvelope | null;
  outcome: InvocationTerminalOutcome;
  observations: InvocationObservation[];
  auditEvidence: InvocationAuditEvidence[];
  telemetry: InvocationOperationalTelemetry[];
  /** Null on idempotent readback because response payloads are governed separately. */
  adapterOutcome: AdapterOutcome | null;
  replayed: boolean;
};

export type GatewayRefusalResult = {
  kind: "refusal";
  intent: InvocationIntent;
  refusal: InvocationRefusal;
  outcome: InvocationTerminalOutcome;
  auditEvidence: InvocationAuditEvidence[];
};

export type GatewayResult = GatewayPlanResult | GatewayRefusalResult;

export interface LocalInvocationGateway {
  invoke(request: InvokeRequest): Promise<GatewayResult>;
}

export interface InvocationAuditAuthority {
  admittedBy: string;
  admissionRef: string;
}

export interface GatewayContextInput {
  request: InvokeRequest;
  clock: AuthoritativeDecisionClock;
}

export interface GatewayMaterializationInput {
  request: InvokeRequest;
  intent: InvocationIntent;
  context: ResolverContext;
}

export interface LocalInvocationGatewayOptions {
  store: IntelligenceRegistryStore;
  adapters?: Record<string, InvocationAdapter>;
  /** Resolve an implementation from the exact planned adapter resource. */
  adapterFor?: (adapter: CatalogInferenceAdapter) => InvocationAdapter | null | undefined;
  /** No ambient clock is consulted by the gateway. */
  clock: () => AuthoritativeDecisionClock;
  /** Supplies Site, runtime, access, and admitted topology facts for this exact invocation. */
  contextFor(input: GatewayContextInput): ResolverContext | Promise<ResolverContext>;
  /** Acquires destination-admitted cross-Site inputs for this exact resolver invocation. */
  materializationFor(input: GatewayMaterializationInput): ResolverMaterializedInputs | Promise<ResolverMaterializedInputs>;
  /** Explicit authority that admits observations as audit evidence. */
  auditAuthority: InvocationAuditAuthority;
  /** Explicit policy boundary for provider result payload retention. */
  resultPayloadPolicy(input: ResultPayloadPolicyInput): ResultPayloadPolicyDecision | Promise<ResultPayloadPolicyDecision>;
}

const modeTrigger: Partial<Record<PlanAttemptMode, PlanRevalidationTrigger>> = {
  "queued-batch": "before-queued-attempt",
  delayed: "at-scheduled-window",
  retry: "before-retry",
  resume: "before-resume",
};

function normalizedIntentShape(intent: InvocationIntent): unknown {
  return {
    principal: intent.principal ?? null,
    purpose: intent.purpose,
    input_digest: intent.input_digest ?? null,
    required_capabilities: intent.required_capabilities ?? [],
    requested_model: intent.requested_model ?? null,
    requested_options: intent.requested_options ?? {},
  };
}

interface PlannedExecutionResources {
  model: Model;
  modelProvider: ModelProvider;
  offering: ModelOffering;
  inferenceProvider: InferenceProvider;
  endpoint: InferenceEndpoint;
  adapter: CatalogInferenceAdapter;
  credential: CredentialLocator | null;
}

async function plannedResource(
  store: IntelligenceRegistryStore,
  plan: InvocationPlan,
  ref: ResourceRef,
  expectedSchema: Resource["schema"],
): Promise<Resource> {
  const revisions = plan.snapshot.referenced_revisions.filter(({ kind, record_id }) =>
    kind === "catalog" && record_id === ref.id
  );
  if (revisions.length !== 1) {
    throw new Error(`plan-resource-binding-invalid: '${ref.id}' has ${revisions.length} catalog revision bindings`);
  }
  const revision = revisions[0]!;
  const record = await store.getCatalogRecord(revision.immutable_ref);
  if (!record) {
    throw new Error(`plan-resource-missing: immutable record '${revision.immutable_ref}' for '${ref.id}' is unavailable`);
  }
  if (
    record.id !== revision.immutable_ref
    || record.record_kind !== "resource"
    || record.record_id !== ref.id
    || `${record.revision}:${record.source.revision}` !== revision.revision
    || record.source.digest !== revision.digest
  ) {
    throw new Error(`plan-resource-revision-mismatch: immutable record '${revision.immutable_ref}' no longer matches '${ref.id}'`);
  }
  const resource = record.document;
  const diagnostics = validateResource(resource);
  if (diagnostics.length > 0 || resource.schema !== expectedSchema || resource.id !== ref.id) {
    throw new Error(`plan-resource-invalid: '${ref.id}' is not a valid '${expectedSchema}' resource`);
  }
  return resource as Resource;
}

async function loadPlannedExecutionResources(
  store: IntelligenceRegistryStore,
  plan: InvocationPlan,
): Promise<PlannedExecutionResources> {
  const [modelResource, modelProviderResource, offeringResource, inferenceProviderResource, endpointResource, adapterResource, credentialResource] = await Promise.all([
    plannedResource(store, plan, plan.selected.model, "narada.invokable-intelligence.model.v1"),
    plannedResource(store, plan, plan.selected.model_provider, "narada.invokable-intelligence.model-provider.v1"),
    plannedResource(store, plan, plan.route.offering, "narada.invokable-intelligence.model-offering.v1"),
    plannedResource(store, plan, plan.selected.inference_provider, "narada.invokable-intelligence.inference-provider.v1"),
    plannedResource(store, plan, plan.selected.endpoint, "narada.invokable-intelligence.inference-endpoint.v1"),
    plannedResource(store, plan, plan.selected.adapter, "narada.invokable-intelligence.adapter.v1"),
    plan.selected.credential
      ? plannedResource(store, plan, plan.selected.credential, "narada.invokable-intelligence.credential-locator.v1")
      : Promise.resolve(null),
  ]);
  const model = modelResource as Model;
  const modelProvider = modelProviderResource as ModelProvider;
  const offering = offeringResource as ModelOffering;
  const inferenceProvider = inferenceProviderResource as InferenceProvider;
  const endpoint = endpointResource as InferenceEndpoint;
  const adapter = adapterResource as CatalogInferenceAdapter;
  const credential = credentialResource as CredentialLocator | null;
  const mismatches = [
    offering.model.id === plan.selected.model.id ? null : "offering-model",
    offering.model_provider.id === plan.selected.model_provider.id ? null : "offering-model-provider",
    offering.inference_provider.id === plan.selected.inference_provider.id ? null : "offering-inference-provider",
    offering.endpoint.id === plan.selected.endpoint.id ? null : "offering-endpoint",
    model.provider.id === plan.selected.model_provider.id ? null : "model-provider",
    endpoint.inference_provider.id === plan.selected.inference_provider.id ? null : "endpoint-inference-provider",
    endpoint.adapter.id === plan.selected.adapter.id ? null : "endpoint-adapter",
    endpoint.serves.some(({ id }) => id === plan.selected.model.id) ? null : "endpoint-model",
    endpoint.credential?.id === plan.selected.credential?.id ? null : "endpoint-credential",
  ].filter((value): value is string => value !== null);
  if (mismatches.length > 0) {
    throw new Error(`plan-resource-graph-mismatch: ${mismatches.join(", ")}`);
  }
  return { model, modelProvider, offering, inferenceProvider, endpoint, adapter, credential };
}

async function listIntentAttempts(store: IntelligenceRegistryStore, intentId: string): Promise<InvocationExecutionAttempt[]> {
  const plans = await store.listPlansByIntent(intentId);
  const attempts = (await Promise.all(plans.map(({ id }) => store.listExecutionAttempts(id)))).flat();
  return attempts.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

function attemptLineage(
  mode: PlanAttemptMode,
  predecessor: InvocationExecutionAttempt | undefined,
): InvocationExecutionAttempt["lineage"] {
  if (!predecessor) return { relation: "initial" };
  return {
    relation: mode === "retry" ? "retry-of" : mode === "resume" ? "resume-of" : "replay-of",
    predecessor_attempt_id: predecessor.id,
  };
}

function makeStaleRefusal(intent: InvocationIntent, context: ResolverContext, reasons: string[]): InvocationRefusal {
  return {
    schema: "narada.invokable-intelligence.invocation-refusal.v1",
    id: deterministicId("refusal", { intent: intent.id, clock: context.clock, code: "stale-plan", reasons }),
    intent_id: intent.id,
    created_at: context.clock.instant,
    resolver_version: "invokable-intelligence-runtime/0.2.0",
    reason_code: "stale-plan",
    explanation: `recorded plan cannot be used: ${reasons.join(", ")}`,
    rejected_candidates: [],
  };
}

export function createLocalInvocationGateway(options: LocalInvocationGatewayOptions): LocalInvocationGateway {
  const { store, adapters = {} } = options;
  if (Object.keys(adapters).length === 0 && !options.adapterFor) {
    throw new Error("invocation-adapter-required: configure adapters or adapterFor");
  }

  async function auditEvidence(
    evidenceType: InvocationAuditEvidence["evidence_type"],
    subjects: InvocationAuditEvidence["subjects"],
    admittedAt: string,
    sourceObservationIds: string[] = [],
  ): Promise<InvocationAuditEvidence> {
    const canonical = {
      evidenceType,
      subjects,
      admittedAt,
      sourceObservationIds,
      admittedBy: options.auditAuthority.admittedBy,
      admissionRef: options.auditAuthority.admissionRef,
    };
    return {
      schema: "narada.invokable-intelligence.audit-evidence.v1",
      id: deterministicId("audit-evidence", canonical),
      subjects,
      evidence_type: evidenceType,
      admitted_at: admittedAt,
      admitted_by: options.auditAuthority.admittedBy,
      admission_ref: options.auditAuthority.admissionRef,
      provenance: {
        source: "operator",
        recorded_at: admittedAt,
        actor: options.auditAuthority.admittedBy,
        reference: options.auditAuthority.admissionRef,
      },
      integrity_digest: await sha256Digest(canonical),
      source_observation_ids: sourceObservationIds,
      evidence_refs: [],
    };
  }

  async function recordRefusal(
    intent: InvocationIntent,
    refusal: InvocationRefusal,
    operationKey: string,
  ): Promise<GatewayRefusalResult> {
    const outcomeId = deterministicId("outcome", { intent: intent.id, operationKey, kind: "pre-invocation-refusal" });
    const recordedOutcome = await store.getTerminalOutcome(outcomeId);
    if (recordedOutcome) return recordedRefusalResult(intent, recordedOutcome);
    await store.recordRefusal(refusal);
    const outcome: InvocationTerminalOutcome = {
      schema: "narada.invokable-intelligence.terminal-outcome.v1",
      id: outcomeId,
      intent_id: intent.id,
      kind: "pre-invocation-refusal",
      terminal_at: refusal.created_at,
      refusal_id: refusal.id,
      admission_acknowledged: false,
    };
    await store.recordTerminalOutcome(outcome);
    const evidence = await auditEvidence(
      "admission-decision",
      [{ kind: "intent", id: intent.id }, { kind: "outcome", id: outcome.id }],
      refusal.created_at,
    );
    await store.recordInvocationAuditEvidence(evidence);
    return { kind: "refusal", intent, refusal, outcome, auditEvidence: [evidence] };
  }

  async function recordedRefusalResult(
    intent: InvocationIntent,
    outcome: InvocationTerminalOutcome,
  ): Promise<GatewayRefusalResult> {
    if (outcome.kind !== "pre-invocation-refusal" || !outcome.refusal_id) {
      throw new Error(`invalid-recorded-refusal-outcome: '${outcome.id}' does not identify a refusal`);
    }
    const refusal = await store.getRefusal(outcome.refusal_id);
    if (!refusal) throw new Error(`incomplete-recorded-refusal: '${outcome.id}' references missing refusal '${outcome.refusal_id}'`);
    const audit = (await store.listInvocationAuditEvidence(intent.id))
      .filter(({ subjects }) => subjects.some(({ id }) => id === outcome.id));
    return { kind: "refusal", intent, refusal, outcome, auditEvidence: audit };
  }

  async function recordedPlanResult(
    intent: InvocationIntent,
    attempt: InvocationExecutionAttempt,
  ): Promise<GatewayPlanResult | null> {
    const plan = await store.getPlan(attempt.plan_id);
    const outcome = await store.getTerminalOutcomeByAttempt(attempt.id);
    if (!plan || !outcome) return null;
    const transitions = await store.listExecutionTransitions(attempt.id);
    const priorState = transitions.at(-1)?.state ?? attempt.state;
    if (priorState !== "terminal") {
      await store.recordExecutionTransition({
        schema: "narada.invokable-intelligence.execution-transition.v1",
        id: deterministicId("transition", { attemptId: attempt.id, state: "terminal", outcome: outcome.id }),
        attempt_id: attempt.id,
        sequence: transitions.length + 1,
        previous_state: priorState,
        state: "terminal",
        transitioned_at: outcome.terminal_at,
      });
    }
    const [results, observations, audit, telemetry] = await Promise.all([
      store.listResultEnvelopes(attempt.id),
      store.listInvocationObservations(attempt.id),
      store.listInvocationAuditEvidence(attempt.id),
      store.listInvocationTelemetry(attempt.id),
    ]);
    return {
      kind: "plan",
      intent,
      plan,
      attempt,
      result: results[0] ?? null,
      outcome,
      observations,
      auditEvidence: audit,
      telemetry,
      adapterOutcome: null,
      replayed: true,
    };
  }

  async function reconcileIncompleteAttempt(
    intent: InvocationIntent,
    attempt: InvocationExecutionAttempt,
  ): Promise<GatewayPlanResult> {
    const plan = await store.getPlan(attempt.plan_id);
    if (!plan) throw new Error(`incomplete-recorded-attempt: '${attempt.id}' references missing plan '${attempt.plan_id}'`);
    const terminalClock = options.clock();
    const transitions = await store.listExecutionTransitions(attempt.id);
    const priorState = transitions.at(-1)?.state ?? attempt.state;
    const admissionUncertain = priorState === "provider-pending" || priorState === "terminal";
    const recoveryKind: InvocationTerminalOutcome["kind"] = admissionUncertain
      ? "admission-unknown"
      : "provider-failure";
    const outcomeId = deterministicId("outcome", {
      attemptId: attempt.id,
      recovery: "incomplete-recorded-attempt",
      priorState,
      recoveryKind,
    });
    let outcome = await store.getTerminalOutcome(outcomeId);
    if (!outcome) {
      outcome = {
        schema: "narada.invokable-intelligence.terminal-outcome.v1",
        id: outcomeId,
        attempt_id: attempt.id,
        intent_id: intent.id,
        plan_id: plan.id,
        kind: recoveryKind,
        terminal_at: terminalClock.instant,
        error: {
          code: "incomplete-recorded-attempt",
          message_ref: await sha256Digest("A prior process stopped after recording an attempt but before recording its outcome."),
          retryable: !admissionUncertain,
        },
        ...(!admissionUncertain ? { admission_acknowledged: false } : {}),
      };
      await store.recordTerminalOutcome(outcome);
    }
    if (priorState !== "terminal") {
      await store.recordExecutionTransition({
        schema: "narada.invokable-intelligence.execution-transition.v1",
        id: deterministicId("transition", { attemptId: attempt.id, state: "terminal", outcome: outcome.id }),
        attempt_id: attempt.id,
        sequence: transitions.length + 1,
        previous_state: priorState,
        state: "terminal",
        transitioned_at: outcome.terminal_at,
      });
    }
    const observations: InvocationObservation[] = [
      {
        schema: "narada.invokable-intelligence.observation.v1",
        id: deterministicId("observation", { attemptId: attempt.id, kind: "transport-submitted", recovery: true }),
        subject: { kind: "attempt", id: attempt.id },
        kind: "transport-submitted",
        observed_at: outcome.terminal_at,
        status: admissionUncertain ? "uncertain" : "not-observed",
        provenance: { source: "inference", recorded_at: outcome.terminal_at, actor: "invokable-intelligence-runtime-reconciliation" },
        evidence_refs: [],
      },
      {
        schema: "narada.invokable-intelligence.observation.v1",
        id: deterministicId("observation", { attemptId: attempt.id, kind: "transport-acknowledgment", recovery: true }),
        subject: { kind: "attempt", id: attempt.id },
        kind: "transport-acknowledgment",
        observed_at: outcome.terminal_at,
        status: admissionUncertain ? "uncertain" : "not-observed",
        provenance: { source: "inference", recorded_at: outcome.terminal_at, actor: "invokable-intelligence-runtime-reconciliation" },
        evidence_refs: [],
      },
    ];
    for (const observation of observations) await store.recordInvocationObservation(observation);
    const audit = [
      await auditEvidence(
        "reconciliation",
        [{ kind: "attempt", id: attempt.id }, { kind: "outcome", id: outcome.id }],
        outcome.terminal_at,
        observations.map(({ id }) => id),
      ),
      await auditEvidence(
        "terminal-outcome",
        [{ kind: "attempt", id: attempt.id }, { kind: "outcome", id: outcome.id }],
        outcome.terminal_at,
        observations.map(({ id }) => id),
      ),
    ];
    for (const evidence of audit) await store.recordInvocationAuditEvidence(evidence);
    return {
      kind: "plan",
      intent,
      plan,
      attempt,
      result: null,
      outcome,
      observations,
      auditEvidence: audit,
      telemetry: [],
      adapterOutcome: null,
      replayed: true,
    };
  }

  return {
    async invoke(request: InvokeRequest): Promise<GatewayResult> {
      const startedClock = options.clock();
      const inputDigest = request.inputDigest ?? await sha256Digest({
        messages: request.messages ?? null,
        tools: request.tools ?? null,
      });
      const requiredCapabilities = [...(request.requiredCapabilities ?? [])]
        .sort((a, b) => a.family.localeCompare(b.family) || a.name.localeCompare(b.name));
      const intentId = request.intentId ?? deterministicId("intent", {
        purpose: request.purpose,
        principal: request.principal ?? null,
        inputDigest,
        requiredCapabilities,
        requestedModel: request.requestedModel ?? null,
        requestedOptions: request.requestedOptions ?? {},
      });
      const proposedIntent: InvocationIntent = {
        schema: "narada.invokable-intelligence.invocation-intent.v1",
        id: intentId,
        created_at: startedClock.instant,
        ...(request.principal ? { principal: request.principal } : {}),
        purpose: request.purpose,
        input_digest: inputDigest,
        ...(requiredCapabilities.length ? { required_capabilities: requiredCapabilities } : {}),
        ...(request.requestedModel ? { requested_model: request.requestedModel } : {}),
        ...(request.requestedOptions ? { requested_options: request.requestedOptions } : {}),
      };

      let intent = await store.getIntent(intentId);
      if (intent && canonicalJson(normalizedIntentShape(intent)) !== canonicalJson(normalizedIntentShape(proposedIntent))) {
        throw new Error(`intent-id-conflict: '${intentId}' already identifies different admitted inputs`);
      }
      if (!intent) {
        intent = proposedIntent;
        await store.putIntent(intent);
      }

      const mode = request.mode ?? "immediate";
      const priorAttempts = await listIntentAttempts(store, intent.id);
      const operationKey = request.operationId ?? `sequence:${priorAttempts.length + 1}:${startedClock.instant}`;
      const refusalOutcomeId = deterministicId("outcome", { intent: intent.id, operationKey, kind: "pre-invocation-refusal" });
      const recordedRefusalOutcome = await store.getTerminalOutcome(refusalOutcomeId);
      if (recordedRefusalOutcome) return recordedRefusalResult(intent, recordedRefusalOutcome);
      const attemptId = deterministicId("attempt", { intent: intent.id, operationKey });
      const recordedAttempt = await store.getExecutionAttempt(attemptId);
      if (recordedAttempt) {
        const recorded = await recordedPlanResult(intent, recordedAttempt);
        if (recorded) return recorded;
        return reconcileIncompleteAttempt(intent, recordedAttempt);
      }

      const context = await options.contextFor({ request, clock: startedClock });
      if (context.clock.instant !== startedClock.instant) {
        throw new Error("context-clock-mismatch: contextFor must preserve the supplied authoritative clock");
      }
      const materializedInputs = await options.materializationFor({ request, intent, context });

      let plan = await store.getPlanByIntent(intent.id);
      if (!plan) {
        const resolved = await resolveInvocation(intent, context, { store, materializedInputs });
        if (resolved.schema === "narada.invokable-intelligence.invocation-refusal.v1") {
          return recordRefusal(intent, resolved, operationKey);
        }
        plan = resolved;
        await store.recordPlan(plan);
        await store.recordPlanSnapshot(plan.snapshot);
      } else {
        const currentDigests = await computeResolverStateDigests(intent, context, { store, materializedInputs });
        const trigger = modeTrigger[mode];
        const evaluation = evaluatePlanUse(plan.snapshot, {
          evaluated_at: startedClock.instant,
          clock: startedClock,
          mode,
          current_digests: currentDigests,
          observed_triggers: trigger ? [trigger] : [],
          replan_available: request.allowReplan !== false,
          ...(priorAttempts.at(-1) ? { predecessor_attempt_id: priorAttempts.at(-1)!.id } : {}),
        });
        let replacement: InvocationPlan | null = null;
        if (evaluation.decision === "replan-required") {
          const resolved = await resolveInvocation(intent, context, { store, materializedInputs, predecessorPlanId: plan.id });
          if (resolved.schema === "narada.invokable-intelligence.invocation-refusal.v1") {
            await store.recordPlanRevalidation({
              schema: "narada.invokable-intelligence.plan-revalidation-evidence.v1",
              id: deterministicId("revalidation", { plan: plan.id, operationKey, evaluation }),
              intent_id: intent.id,
              plan_id: plan.id,
              evaluated_at: startedClock.instant,
              mode,
              decision: evaluation.decision,
              reasons: evaluation.reasons,
              prior_snapshot_digest: plan.snapshot.snapshot_digest,
              compared_digests: currentDigests,
              clock_authority_ref: startedClock.authority_ref,
            });
            return recordRefusal(intent, resolved, operationKey);
          }
          replacement = resolved;
          await store.recordPlan(replacement);
          await store.recordPlanSnapshot(replacement.snapshot);
        }
        const revalidation: PlanRevalidationEvidence = {
          schema: "narada.invokable-intelligence.plan-revalidation-evidence.v1",
          id: deterministicId("revalidation", { plan: plan.id, operationKey, evaluation, replacement: replacement?.id ?? null }),
          intent_id: intent.id,
          plan_id: plan.id,
          evaluated_at: startedClock.instant,
          mode,
          decision: evaluation.decision,
          reasons: evaluation.reasons,
          prior_snapshot_digest: plan.snapshot.snapshot_digest,
          compared_digests: currentDigests,
          clock_authority_ref: startedClock.authority_ref,
          ...(replacement ? { replacement_plan_id: replacement.id } : {}),
        };
        await store.recordPlanRevalidation(revalidation);
        if (evaluation.decision === "refuse-stale-plan") {
          return recordRefusal(intent, makeStaleRefusal(intent, context, evaluation.reasons), operationKey);
        }
        if (replacement) plan = replacement;
      }

      const predecessor = priorAttempts.at(-1);
      const attempt: InvocationExecutionAttempt = {
        schema: "narada.invokable-intelligence.execution-attempt.v1",
        id: attemptId,
        intent_id: intent.id,
        plan_id: plan.id,
        state: "created",
        created_at: startedClock.instant,
        lineage: attemptLineage(mode, predecessor),
      };
      await store.recordExecutionAttempt(attempt);

      let adapterOutcome: AdapterOutcome;
      let adapterInvoked = false;
      let executionResources: PlannedExecutionResources | null = null;
      let executionResourceError: unknown = null;
      try {
        executionResources = await loadPlannedExecutionResources(store, plan);
      } catch (error) {
        executionResourceError = error;
      }
      let terminalPriorState: InvocationExecutionTransition["state"] = "created";
      let terminalSequence = 1;
      if (!executionResources) {
        adapterOutcome = {
          admission: "not-acknowledged",
          transportSubmitted: false,
          error: {
            code: "execution-resource-invalid",
            message: executionResourceError instanceof Error ? executionResourceError.message : String(executionResourceError),
            retryable: false,
          },
        };
      } else {
        const dispatchTransition: InvocationExecutionTransition = {
          schema: "narada.invokable-intelligence.execution-transition.v1",
          id: deterministicId("transition", { attemptId, sequence: 1, state: "dispatching" }),
          attempt_id: attemptId,
          sequence: 1,
          previous_state: "created",
          state: "dispatching",
          transitioned_at: startedClock.instant,
        };
        await store.recordExecutionTransition(dispatchTransition);
        terminalPriorState = "dispatching";
        terminalSequence = 2;

        const runtimeAdapter = options.adapterFor?.(executionResources.adapter)
          ?? adapters[executionResources.adapter.id];
        if (!runtimeAdapter) {
          adapterOutcome = {
            admission: "not-acknowledged",
            transportSubmitted: false,
            error: { code: "adapter-missing", message: `no invocable adapter registered for '${executionResources.adapter.id}'`, retryable: false },
          };
        } else {
          const pendingClock = options.clock();
          const pendingTransition: InvocationExecutionTransition = {
            schema: "narada.invokable-intelligence.execution-transition.v1",
            id: deterministicId("transition", { attemptId, sequence: 2, state: "provider-pending" }),
            attempt_id: attemptId,
            sequence: 2,
            previous_state: "dispatching",
            state: "provider-pending",
            transitioned_at: pendingClock.instant,
          };
          await store.recordExecutionTransition(pendingTransition);
          terminalPriorState = "provider-pending";
          terminalSequence = 3;
          adapterInvoked = true;
          try {
            adapterOutcome = await runtimeAdapter.invoke({
              plan,
              messages: request.messages ?? null,
              tools: request.tools ?? null,
              ...(request.abortSignal ? { abortSignal: request.abortSignal } : {}),
              ...executionResources,
              ...(request.invocationId ? { invocationId: request.invocationId } : { invocationId: attemptId }),
              ...(request.turnId ? { turnId: request.turnId } : {}),
              ...(request.inputEventId ? { inputEventId: request.inputEventId } : {}),
              ...(request.requestId ? { requestId: request.requestId } : {}),
              ...(request.invocationScope ? { invocationScope: request.invocationScope } : {}),
              ...(request.invocationEventSink ? { invocationEventSink: request.invocationEventSink } : {}),
            });
          } catch (error) {
            adapterOutcome = {
              admission: "uncertain",
              error: {
                code: "adapter-threw",
                message: error instanceof Error ? error.message : String(error),
                retryable: true,
              },
            };
          }
        }
      }

      const terminalClock = options.clock();
      const admission: AdmissionStatus = adapterOutcome.admission
        ?? (adapterOutcome.error ? "uncertain" : "acknowledged");
      const terminalKind: InvocationTerminalOutcome["kind"] = admission === "uncertain"
        ? "admission-unknown"
        : adapterOutcome.error ? "provider-failure"
          : admission === "acknowledged" ? "success" : "admission-unknown";

      let result: InvocationResultEnvelope | null = null;
      if (terminalKind === "success") {
        const digest = await sha256Digest(adapterOutcome.response ?? null);
        const policy = await options.resultPayloadPolicy({
          request,
          intent,
          plan,
          response: adapterOutcome.response ?? null,
          digest,
          producedAt: terminalClock.instant,
        });
        result = {
          schema: "narada.invokable-intelligence.result-envelope.v1",
          id: deterministicId("result", { attemptId, digest }),
          attempt_id: attemptId,
          plan_id: plan.id,
          produced_at: terminalClock.instant,
          kind: "provider-response",
          payload: { digest, ...policy },
          ...(adapterOutcome.providerRequestRef ? { provider_result_ref: adapterOutcome.providerRequestRef } : {}),
        };
        await store.recordResultEnvelope(result);
      }

      const outcome: InvocationTerminalOutcome = {
        schema: "narada.invokable-intelligence.terminal-outcome.v1",
        id: deterministicId("outcome", { attemptId, terminalKind, result: result?.id ?? null }),
        attempt_id: attemptId,
        intent_id: intent.id,
        plan_id: plan.id,
        kind: terminalKind,
        terminal_at: terminalClock.instant,
        ...(result ? { result_id: result.id } : {}),
        ...(adapterOutcome.error ? {
          error: {
            code: adapterOutcome.error.code,
            message_ref: await sha256Digest(adapterOutcome.error.message),
            retryable: adapterOutcome.error.retryable ?? terminalKind === "admission-unknown",
          },
        } : {}),
        ...(admission === "acknowledged" ? { admission_acknowledged: true } : {}),
        ...(admission === "not-acknowledged" ? { admission_acknowledged: false } : {}),
      };
      await store.recordTerminalOutcome(outcome);

      const terminalTransition: InvocationExecutionTransition = {
        schema: "narada.invokable-intelligence.execution-transition.v1",
        id: deterministicId("transition", { attemptId, state: "terminal", outcome: outcome.id }),
        attempt_id: attemptId,
        sequence: terminalSequence,
        previous_state: terminalPriorState,
        state: "terminal",
        transitioned_at: terminalClock.instant,
      };
      await store.recordExecutionTransition(terminalTransition);

      const transportStatus: InvocationObservation["status"] = !adapterInvoked
        ? "not-observed"
        : adapterOutcome.transportSubmitted === true || admission === "acknowledged"
          ? "observed"
          : adapterOutcome.transportSubmitted === false
            ? "not-observed"
            : "uncertain";
      const submittedObservation: InvocationObservation = {
        schema: "narada.invokable-intelligence.observation.v1",
        id: deterministicId("observation", { attemptId, kind: "transport-submitted" }),
        subject: { kind: "attempt", id: attemptId },
        kind: "transport-submitted",
        observed_at: terminalClock.instant,
        status: transportStatus,
        provenance: { source: "inference", recorded_at: terminalClock.instant, actor: "invokable-intelligence-runtime" },
        evidence_refs: [],
      };

      const acknowledgementObservation: InvocationObservation = {
        schema: "narada.invokable-intelligence.observation.v1",
        id: deterministicId("observation", { attemptId, kind: "transport-acknowledgment" }),
        subject: { kind: "attempt", id: attemptId },
        kind: "transport-acknowledgment",
        observed_at: terminalClock.instant,
        status: admission === "acknowledged" ? "observed" : admission === "not-acknowledged" ? "not-observed" : "uncertain",
        provenance: { source: "inference", recorded_at: terminalClock.instant, actor: "invokable-intelligence-runtime" },
        evidence_refs: [],
      };
      const providerObservation: InvocationObservation | null = adapterInvoked ? {
        schema: "narada.invokable-intelligence.observation.v1",
        id: deterministicId("observation", { attemptId, kind: "provider-event", outcome: terminalKind }),
        subject: { kind: "attempt", id: attemptId },
        kind: "provider-event",
        observed_at: terminalClock.instant,
        status: admission === "acknowledged" ? "observed" : admission === "not-acknowledged" ? "not-observed" : "uncertain",
        provenance: { source: "inference", recorded_at: terminalClock.instant, actor: "invokable-intelligence-runtime" },
        integrity_digest: await sha256Digest({
          admission,
          error: adapterOutcome.error?.code ?? null,
          response: adapterOutcome.response === undefined ? null : await sha256Digest(adapterOutcome.response),
          usage: adapterOutcome.usage ?? null,
        }),
        evidence_refs: [],
      } : null;
      const observations = [submittedObservation, acknowledgementObservation, ...(providerObservation ? [providerObservation] : [])];
      for (const observation of observations) await store.recordInvocationObservation(observation);

      const audit = [
        await auditEvidence(
          "execution-transition",
          [{ kind: "attempt", id: attemptId }, { kind: "outcome", id: outcome.id }],
          terminalClock.instant,
          observations.map(({ id }) => id),
        ),
        await auditEvidence(
          "admission-decision",
          [{ kind: "attempt", id: attemptId }, { kind: "outcome", id: outcome.id }],
          terminalClock.instant,
          [submittedObservation.id, acknowledgementObservation.id],
        ),
        ...(result ? [await auditEvidence(
          "result-integrity",
          [{ kind: "attempt", id: attemptId }, { kind: "result", id: result.id }],
          terminalClock.instant,
          providerObservation ? [providerObservation.id] : [],
        )] : []),
        await auditEvidence(
          "terminal-outcome",
          [{ kind: "attempt", id: attemptId }, { kind: "outcome", id: outcome.id }],
          terminalClock.instant,
          observations.map(({ id }) => id),
        ),
      ];
      for (const evidence of audit) await store.recordInvocationAuditEvidence(evidence);

      const telemetry: InvocationOperationalTelemetry[] = adapterOutcome.usage || adapterOutcome.providerRequestRef ? [{
        schema: "narada.invokable-intelligence.telemetry.v1",
        id: deterministicId("telemetry", { attemptId, at: terminalClock.instant, usage: adapterOutcome.usage ?? null }),
        attempt_id: attemptId,
        recorded_at: terminalClock.instant,
        ...(adapterOutcome.usage?.input_tokens !== undefined ? { input_tokens: adapterOutcome.usage.input_tokens } : {}),
        ...(adapterOutcome.usage?.output_tokens !== undefined ? { output_tokens: adapterOutcome.usage.output_tokens } : {}),
        ...(adapterOutcome.usage?.cached_tokens !== undefined ? { cached_tokens: adapterOutcome.usage.cached_tokens } : {}),
        ...(adapterOutcome.usage?.latency_ms !== undefined ? { latency_ms: adapterOutcome.usage.latency_ms } : {}),
        ...(adapterOutcome.usage?.queue_ms !== undefined ? { queue_ms: adapterOutcome.usage.queue_ms } : {}),
        ...(adapterOutcome.providerRequestRef ? { provider_request_ref: adapterOutcome.providerRequestRef } : {}),
      }] : [];
      for (const record of telemetry) await store.recordInvocationTelemetry(record);

      return {
        kind: "plan",
        intent,
        plan,
        attempt,
        result,
        outcome,
        observations,
        auditEvidence: audit,
        telemetry,
        adapterOutcome,
        replayed: false,
      };
    },
  };
}
