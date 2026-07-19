/**
 * Local invocation gateway. The runtime entry point that replaces
 * env-based provider/model selection: every invocation resolves through
 * the deterministic resolver immediately before dispatch, invokes only
 * the adapter named by the plan, and persists the full
 * Intent -> Plan -> Attempt -> Evidence chain.
 *
 * Replay/restart semantics: callers pin intentId (and optionally
 * attemptId). A recorded plan for the same intent is reused verbatim
 * (decision provenance preserved across restarts); attempts upsert by id
 * so retries never duplicate.
 */

import type {
  CapabilityKey,
  CredentialLocator,
  InvocationAttempt,
  InvocationEvidence,
  InvocationIntent,
  InvocationPlan,
  InvocationRefusal,
  ResourceRef,
} from "@narada2/invokable-intelligence-contract";
import type { IntelligenceRegistryStore } from "@narada2/invokable-intelligence-registry";
import { deterministicId, resolveInvocation } from "@narada2/invokable-intelligence-resolver";

import type { LocalSiteContext } from "./context.js";
import { buildResolverContext } from "./context.js";

export interface AdapterInvocation {
  plan: InvocationPlan;
  /** Opaque caller payload (e.g. chat messages) passed through to the adapter. */
  messages: unknown;
  credential: CredentialLocator | null;
}

export interface AdapterOutcome {
  response?: unknown;
  usage?: { input_tokens?: number; output_tokens?: number; latency_ms?: number };
  error?: { code: string; message: string };
}

/** An invocable adapter. The gateway knows nothing about providers; adapters are injected by id. */
export interface InvocationAdapter {
  invoke(input: AdapterInvocation): Promise<AdapterOutcome>;
}

export interface InvokeRequest {
  /** Stable intent id for replay; derived deterministically from the request when omitted. */
  intentId?: string;
  purpose: string;
  principal?: string;
  requiredCapabilities?: CapabilityKey[];
  requestedModel?: ResourceRef;
  requestedOptions?: Record<string, unknown>;
  messages?: unknown;
  /** Stable attempt id for retry dedup; defaults to one attempt per plan. */
  attemptId?: string;
}

export type GatewayResult =
  | {
      kind: "plan";
      intent: InvocationIntent;
      plan: InvocationPlan;
      attempt: InvocationAttempt;
      evidence: InvocationEvidence | null;
      adapterOutcome: AdapterOutcome;
    }
  | { kind: "refusal"; intent: InvocationIntent; refusal: InvocationRefusal };

export interface LocalInvocationGateway {
  invoke(request: InvokeRequest): Promise<GatewayResult>;
}

export function createLocalInvocationGateway(options: {
  store: IntelligenceRegistryStore;
  sites: LocalSiteContext;
  adapters: Record<string, InvocationAdapter>;
  /** Wall-clock override for tests. */
  now?: () => string;
}): LocalInvocationGateway {
  const { store, sites, adapters } = options;
  const now = options.now ?? (() => new Date().toISOString());

  return {
    async invoke(request: InvokeRequest): Promise<GatewayResult> {
      const intentId =
        request.intentId ??
        deterministicId("intent", {
          purpose: request.purpose,
          principal: request.principal ?? null,
          requiredCapabilities: request.requiredCapabilities ?? [],
          requestedModel: request.requestedModel ?? null,
          requestedOptions: request.requestedOptions ?? {},
        });

      // Replay: a recorded intent/plan pair is reused verbatim.
      let intent = await store.getIntent(intentId);
      if (!intent) {
        intent = {
          schema: "narada.invokable-intelligence.invocation-intent.v1",
          id: intentId,
          created_at: now(),
          ...(request.principal ? { principal: request.principal } : {}),
          purpose: request.purpose,
          ...(request.requiredCapabilities ? { required_capabilities: request.requiredCapabilities } : {}),
          ...(request.requestedModel ? { requested_model: request.requestedModel } : {}),
          ...(request.requestedOptions ? { requested_options: request.requestedOptions } : {}),
        };
        await store.putIntent(intent);
      }

      const context = buildResolverContext(sites, { time: now() });
      let plan = await store.getPlanByIntent(intentId);
      if (!plan) {
        const resolved = await resolveInvocation(intent, context, { store });
        if (resolved.schema === "narada.invokable-intelligence.invocation-refusal.v1") {
          await store.recordRefusal(resolved);
          return { kind: "refusal", intent, refusal: resolved };
        }
        plan = resolved;
        await store.recordPlan(plan);
      }

      const attemptId = request.attemptId ?? `attempt:${plan.id}`;
      const startedAt = now();
      const attempt: InvocationAttempt = {
        schema: "narada.invokable-intelligence.invocation-attempt.v1",
        id: attemptId,
        plan_id: plan.id,
        state: "started",
        started_at: startedAt,
      };
      await store.recordAttempt(attempt);

      const adapter = adapters[plan.selected.adapter.id];
      let outcome: AdapterOutcome;
      if (!adapter) {
        outcome = { error: { code: "adapter-missing", message: `no invocable adapter registered for '${plan.selected.adapter.id}'` } };
      } else {
        const credentialResource = plan.selected.credential
          ? await store.getResource(plan.selected.credential.id)
          : null;
        const credential =
          credentialResource?.schema === "narada.invokable-intelligence.credential-locator.v1" ? credentialResource : null;
        try {
          outcome = await adapter.invoke({ plan, messages: request.messages ?? null, credential });
        } catch (error) {
          outcome = {
            error: {
              code: "adapter-threw",
              message: error instanceof Error ? error.message : String(error),
            },
          };
        }
      }

      const succeeded = !outcome.error;
      const finished: InvocationAttempt = {
        ...attempt,
        state: succeeded ? "succeeded" : "failed",
        ended_at: now(),
        ...(outcome.error ? { error: outcome.error } : {}),
      };
      await store.recordAttempt(finished);

      let evidence: InvocationEvidence | null = null;
      if (succeeded) {
        evidence = {
          schema: "narada.invokable-intelligence.invocation-evidence.v1",
          id: `evidence:${attemptId}`,
          attempt_id: attemptId,
          recorded_at: now(),
          ...(outcome.usage ? { usage: outcome.usage } : {}),
          evidence: [{ kind: "run", ref: `local-invocation/${attemptId}` }],
        };
        await store.recordEvidence(evidence);
      }

      return { kind: "plan", intent, plan, attempt: finished, evidence, adapterOutcome: outcome };
    },
  };
}
