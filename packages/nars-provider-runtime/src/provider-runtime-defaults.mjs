import { providerEnvironment } from '@narada2/carrier-provider-contract';
import { resolveCodexSubscriptionModelCatalog } from '@narada2/carrier-provider-support/codex-subscription-models';

export function resolveProviderRuntimeDefaults(provider, env = process.env) {
  const declared = providerEnvironment(provider, undefined, env);
  if (provider !== 'codex-subscription') {
    return {
      ...declared,
      modelCatalog: {
        models: declared.availableModels,
        source: 'declared_registry',
        observed_at: null,
        cache_path: null,
        fallback_reason: null,
      },
    };
  }

  const modelCatalog = resolveCodexSubscriptionModelCatalog({
    processEnv: env,
    fallbackModels: declared.availableModels,
    maxAgeMs: Number(declared.providerDefault?.model_catalog?.max_age_ms) || undefined,
  });
  const explicitModel = firstValue(['CODEX_MODEL', 'NARADA_CODEX_MODEL'], env);
  const model = explicitModel
    ?? (modelCatalog.models.includes(declared.model) ? declared.model : modelCatalog.models[0] ?? declared.model);
  return { ...declared, model, availableModels: modelCatalog.models, modelCatalog };
}

function firstValue(names, env) {
  for (const name of names) {
    if (typeof env[name] === 'string' && env[name].trim()) return env[name].trim();
  }
  return null;
}
