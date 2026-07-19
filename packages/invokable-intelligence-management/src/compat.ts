/**
 * Bounded, read-only compatibility projection: renders registry state back
 * into the legacy provider-registry shape for unmigrated consumers.
 *
 * TEMPORARY by design — this exists so legacy readers keep working while
 * they migrate. It is removed in #2186 once consumers reach zero. Do not
 * extend it; extend the canonical contract instead.
 */

import type { IntelligenceRegistryStore } from "@narada2/invokable-intelligence-registry";

import type { LegacyProviderEntry, LegacyProviderRegistry } from "./legacy.js";

/** Project current registry state into the legacy provider-registry shape. */
export async function projectLegacyRegistry(store: IntelligenceRegistryStore): Promise<LegacyProviderRegistry> {
  const [endpoints, providers, adapters, models, credentials, policies, assertions] = await Promise.all([
    store.listResources({ kind: "inference-endpoint" }),
    store.listResources({ kind: "inference-provider" }),
    store.listResources({ kind: "adapter" }),
    store.listResources({ kind: "model" }),
    store.listResources({ kind: "credential-locator" }),
    store.listPolicies({ kind: "defaults" }),
    store.listAssertions({ family: "support", name: "state" }),
  ]);

  const providerById = new Map(providers.map((r) => [r.id, r]));
  const adapterById = new Map(adapters.map((r) => [r.id, r]));
  const modelById = new Map(models.map((r) => [r.id, r]));
  const credentialById = new Map(credentials.map((r) => [r.id, r]));
  const supportStateBySubject = new Map(assertions.map((a) => [a.subject.id, String(a.value)]));

  const defaultRule = (option: string): string | undefined => {
    for (const policy of policies) {
      for (const rule of policy.rules) {
        if (rule.type === "default-option" && rule.option === option) return String(rule.value);
      }
    }
    return undefined;
  };

  const resultProviders: Record<string, LegacyProviderEntry> = {};
  for (const endpoint of endpoints) {
    if (endpoint.schema !== "narada.invokable-intelligence.inference-endpoint.v1") continue;
    const legacyId = endpoint.id.replace(/^inference-endpoint:/, "");
    const provider = providerById.get(endpoint.inference_provider.id);
    const adapter = adapterById.get(endpoint.adapter.id);
    const entry: LegacyProviderEntry = {};
    if (provider?.metadata?.meaning) entry.meaning = provider.metadata.meaning;
    if (endpoint.metadata?.base_url ?? provider?.metadata?.base_url) {
      entry.base_url = endpoint.metadata?.base_url ?? provider?.metadata?.base_url;
    }
    entry.available_models = endpoint.serves
      .map((ref) => modelById.get(ref.id))
      .map((model) => model?.display_name ?? model?.id.replace(/^model:/, "") ?? "")
      .filter((name) => name.length > 0)
      .sort();
    if (adapter) entry.adapter_kind = adapter.id.replace(/^adapter:/, "");
    const supportState = supportStateBySubject.get(endpoint.inference_provider.id);
    if (supportState) entry.support_state = supportState;
    const defaultModel = defaultRule(`provider.${legacyId}.default_model`);
    if (defaultModel) {
      const model = modelById.get(defaultModel);
      entry.default_model = model?.display_name ?? defaultModel.replace(/^model:/, "");
    }
    if (endpoint.credential) {
      const credential = credentialById.get(endpoint.credential.id);
      if (credential && credential.schema === "narada.invokable-intelligence.credential-locator.v1") {
        entry.credential_env_names = credential.store === "env" ? [credential.reference] : [];
        entry.credential_requirement = {
          kind: credential.store === "env" ? "api_key_secret" : "local_codex_subscription",
          env_names: entry.credential_env_names,
          ...(credential.metadata?.secret_ref ? { secret_ref: credential.metadata.secret_ref } : {}),
        };
      }
    }
    resultProviders[legacyId] = entry;
  }

  const projected: LegacyProviderRegistry = {
    schema: "narada.carrier.provider_registry.v1",
    providers: resultProviders,
  };
  const defaultProviderRule = defaultRule("inference_provider");
  if (defaultProviderRule) {
    projected.default_provider = defaultProviderRule.replace(/^inference-provider:/, "");
  }
  return projected;
}
