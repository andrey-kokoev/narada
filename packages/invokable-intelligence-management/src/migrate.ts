/**
 * Legacy provider-registry migrator. Builds a deterministic migration plan
 * (canonical resources, capability assertions, policy documents) from a
 * legacy registry, with dry-run diff, provenance on every record, and
 * idempotent application.
 */

import type {
  CapabilityAssertion,
  PolicyDocument,
  PolicyRule,
  Provenance,
  Resource,
  ResourceRef,
} from "@narada2/invokable-intelligence-contract";
import type { IntelligenceRegistryStore } from "@narada2/invokable-intelligence-registry";

import type { LegacyProviderRegistry } from "./legacy.js";
import { legacyModelResourceId, legacyVendorSlug } from "./legacy.js";

export interface MigrationLoci {
  targetSite: ResourceRef;
  userSite: ResourceRef;
  hostSite: ResourceRef;
}

export interface MigrationPlan {
  /** Migration identity, recorded as provenance reference on every record. */
  reference: string;
  plannedAt: string;
  loci: MigrationLoci;
  resources: Resource[];
  assertions: CapabilityAssertion[];
  policies: PolicyDocument[];
}

export type DiffStatus = "add" | "update" | "unchanged";

export interface DiffEntry {
  kind: "resource" | "assertion" | "policy";
  id: string;
  status: DiffStatus;
}

export interface MigrationDryRun {
  plan: MigrationPlan;
  diff: DiffEntry[];
  counts: Record<DiffStatus, number>;
}

function provenance(reference: string, plannedAt: string): Provenance {
  return { source: "migration", recorded_at: plannedAt, actor: "invokable-intelligence-management", reference };
}

/** Build the deterministic migration plan for a legacy registry. */
export function buildMigrationPlan(
  legacy: LegacyProviderRegistry,
  loci: MigrationLoci,
  options: { reference: string; plannedAt: string },
): MigrationPlan {
  const resources: Resource[] = [];
  const assertions: CapabilityAssertion[] = [];
  const policies: PolicyDocument[] = [];
  const prov = provenance(options.reference, options.plannedAt);
  const seen = new Set<string>();

  const pushResource = (resource: Resource): void => {
    if (seen.has(resource.id)) return;
    seen.add(resource.id);
    resources.push(resource);
  };

  // Locus sites themselves.
  pushResource({ schema: "narada.invokable-intelligence.site.v1", id: loci.targetSite.id });
  pushResource({ schema: "narada.invokable-intelligence.site.v1", id: loci.userSite.id });
  pushResource({ schema: "narada.invokable-intelligence.site.v1", id: loci.hostSite.id });

  const defaultRules: PolicyRule[] = [];

  for (const legacyId of Object.keys(legacy.providers).sort()) {
    const entry = legacy.providers[legacyId];
    const vendor = legacyVendorSlug(legacyId);

    pushResource({
      schema: "narada.invokable-intelligence.model-provider.v1",
      id: `model-provider:${vendor}`,
      ...(entry.meaning ? { metadata: { meaning: entry.meaning } } : {}),
    });
    pushResource({
      schema: "narada.invokable-intelligence.inference-provider.v1",
      id: `inference-provider:${legacyId}`,
      ...(entry.meaning || entry.base_url
        ? { metadata: { ...(entry.meaning ? { meaning: entry.meaning } : {}), ...(entry.base_url ? { base_url: entry.base_url } : {}) } }
        : {}),
    });

    const adapterKind = entry.adapter_kind ?? "unknown";
    pushResource({
      schema: "narada.invokable-intelligence.adapter.v1",
      id: `adapter:${adapterKind}`,
      runtime_family: adapterKind === "codex-mcp-server" ? "node" : "node",
    });

    const modelIds: ResourceRef[] = [];
    for (const modelName of [...(entry.available_models ?? [])].sort()) {
      const modelId = legacyModelResourceId(legacyId, modelName);
      pushResource({
        schema: "narada.invokable-intelligence.model.v1",
        id: modelId,
        display_name: modelName,
        provider: { kind: "model-provider", id: `model-provider:${vendor}` },
      });
      modelIds.push({ kind: "model", id: modelId });
    }

    const credentialId = `credential-locator:${legacyId}`;
    const requirement = entry.credential_requirement;
    let credentialRef: ResourceRef | undefined;
    if (requirement && requirement.kind !== "none") {
      pushResource({
        schema: "narada.invokable-intelligence.credential-locator.v1",
        id: credentialId,
        store: requirement.kind === "api_key_secret" ? "env" : "none",
        reference:
          requirement.kind === "api_key_secret"
            ? (requirement.env_names?.[0] ?? entry.credential_env_names?.[0] ?? "UNKNOWN_ENV")
            : "codex-local-subscription",
        holder: { kind: "site", id: loci.hostSite.id },
        ...(requirement.secret_ref ? { metadata: { secret_ref: requirement.secret_ref } } : {}),
      });
      credentialRef = { kind: "credential-locator", id: credentialId };
    }

    pushResource({
      schema: "narada.invokable-intelligence.inference-endpoint.v1",
      id: `inference-endpoint:${legacyId}`,
      inference_provider: { kind: "inference-provider", id: `inference-provider:${legacyId}` },
      adapter: { kind: "adapter", id: `adapter:${adapterKind}` },
      serves: modelIds,
      ...(credentialRef ? { credential: credentialRef } : {}),
      ...(entry.base_url ? { metadata: { base_url: entry.base_url } } : {}),
    });

    // Capability assertions: support state on the inference provider; thinking levels on each model.
    if (entry.support_state) {
      assertions.push({
        schema: "narada.invokable-intelligence.capability-assertion.v1",
        id: `assert:migration-${legacyId}-support-state`,
        subject: { kind: "inference-provider", id: `inference-provider:${legacyId}` },
        capability: { family: "support", name: "state" },
        value: entry.support_state,
        scope: { locus: "global" },
        provenance: prov,
        validity: { fresh_as_of: options.plannedAt },
        confidence: 1,
        evidence: [{ kind: "document", ref: options.reference }],
      });
    }
    if (entry.cognition_defaults && Object.values(entry.cognition_defaults).some((d) => d.reasoning_effort)) {
      for (const ref of modelIds) {
        assertions.push({
          schema: "narada.invokable-intelligence.capability-assertion.v1",
          id: `assert:migration-${ref.id.replace(/^model:/, "")}-thinking-levels`,
          subject: ref,
          capability: { family: "thinking", name: "levels" },
          value: { levels: ["low", "medium", "high"] },
          scope: { locus: "global" },
          provenance: prov,
          validity: { fresh_as_of: options.plannedAt },
          confidence: 0.8,
          evidence: [{ kind: "document", ref: options.reference }],
        });
      }
      for (const [tier, defaults] of Object.entries(entry.cognition_defaults).sort(([a], [b]) => a.localeCompare(b))) {
        const tierModel = defaults.model
          ? legacyModelResourceId(legacyId, defaults.model)
          : undefined;
        if (tierModel && modelIds.some((ref) => ref.id === tierModel)) {
          defaultRules.push({
            type: "default-option",
            option: `cognition.${tier}.model`,
            value: tierModel,
            reason: `legacy cognition_defaults.${tier} for ${legacyId}`,
          });
        }
        if (defaults.reasoning_effort) {
          defaultRules.push({
            type: "default-option",
            option: `cognition.${tier}.reasoning_effort`,
            value: defaults.reasoning_effort,
            reason: `legacy cognition_defaults.${tier} for ${legacyId}`,
          });
        }
      }
    }
    if (entry.default_model && modelIds.length > 0) {
      const defaultModelId = legacyModelResourceId(legacyId, entry.default_model);
      if (modelIds.some((ref) => ref.id === defaultModelId)) {
        defaultRules.push({
          type: "default-option",
          option: `provider.${legacyId}.default_model`,
          value: defaultModelId,
          reason: `legacy default_model for ${legacyId}`,
        });
      }
    }
  }

  if (legacy.default_provider && legacy.providers[legacy.default_provider]) {
    defaultRules.unshift({
      type: "default-option",
      option: "inference_provider",
      value: `inference-provider:${legacy.default_provider}`,
      reason: "legacy default_provider",
    });
  }

  if (defaultRules.length > 0) {
    policies.push({
      schema: "narada.invokable-intelligence.policy.v1",
      id: "policy:migration-target-defaults",
      locus: "target-site",
      site: loci.targetSite,
      kind: "defaults",
      revision: 1,
      rules: defaultRules,
    });
  }

  const order = <T extends { id: string }>(records: T[]): T[] => [...records].sort((a, b) => a.id.localeCompare(b.id));
  return {
    reference: options.reference,
    plannedAt: options.plannedAt,
    loci,
    resources: order(resources),
    assertions: order(assertions),
    policies: order(policies),
  };
}

/** Diff a plan against current store state without mutating. */
export async function dryRunMigration(store: IntelligenceRegistryStore, plan: MigrationPlan): Promise<MigrationDryRun> {
  const diff: DiffEntry[] = [];
  for (const resource of plan.resources) {
    const existing = await store.getResource(resource.id);
    diff.push({
      kind: "resource",
      id: resource.id,
      status: !existing ? "add" : JSON.stringify(existing) === JSON.stringify(resource) ? "unchanged" : "update",
    });
  }
  for (const assertion of plan.assertions) {
    const existing = await store.getAssertion(assertion.id);
    diff.push({
      kind: "assertion",
      id: assertion.id,
      status: !existing ? "add" : JSON.stringify(existing) === JSON.stringify(assertion) ? "unchanged" : "update",
    });
  }
  for (const policy of plan.policies) {
    const existing = await store.getPolicy(policy.id);
    diff.push({
      kind: "policy",
      id: policy.id,
      status: !existing ? "add" : JSON.stringify(existing) === JSON.stringify(policy) ? "unchanged" : "update",
    });
  }
  const counts: Record<DiffStatus, number> = { add: 0, update: 0, unchanged: 0 };
  for (const entry of diff) counts[entry.status] += 1;
  return { plan, diff, counts };
}

/** Apply a plan. Idempotent: re-applying the same plan changes nothing. */
export async function applyMigration(store: IntelligenceRegistryStore, plan: MigrationPlan): Promise<MigrationDryRun> {
  for (const resource of plan.resources) await store.putResource(resource);
  for (const assertion of plan.assertions) await store.putAssertion(assertion);
  for (const policy of plan.policies) await store.putPolicy(policy);
  return dryRunMigration(store, plan);
}
