import type {
  HealthIntelligenceSummary,
  IntelligenceModelChoice,
  IntelligenceProviderChoice,
} from '../composables/useHealthStatus';

export interface IntelligenceSelectionDraft {
  inferenceProvider: string | null;
  model: string | null;
  thinking: string | null;
}

export function providerChoicesFor(intelligence: HealthIntelligenceSummary): readonly IntelligenceProviderChoice[] {
  if (intelligence.selectionChoices.length > 0) return intelligence.selectionChoices;
  return intelligence.providerChoices.map((provider) => ({ provider, models: [] }));
}

export function modelsForProvider(
  intelligence: HealthIntelligenceSummary,
  provider: string | null,
): readonly IntelligenceModelChoice[] {
  if (!provider) return [];
  if (intelligence.selectionChoices.length > 0) {
    return intelligence.selectionChoices.find((choice) => choice.provider === provider)?.models ?? [];
  }
  // A flat model list is safe to display only when the health payload exposes
  // one provider. With multiple providers there is no valid way to infer the
  // provider/model relation, so leave the model select unavailable until the
  // qualified projection arrives.
  if (intelligence.providerChoices.length !== 1 || intelligence.providerChoices[0] !== provider) return [];
  return intelligence.modelChoices.map((model) => ({
    model,
    thinkingChoices: intelligence.thinkingChoices,
  }));
}

export function thinkingChoicesFor(
  intelligence: HealthIntelligenceSummary,
  provider: string | null,
  model: string | null,
): readonly string[] {
  if (!model) return [];
  if (intelligence.selectionChoices.length > 0) {
    return modelsForProvider(intelligence, provider).find((choice) => choice.model === model)?.thinkingChoices ?? [];
  }
  return modelsForProvider(intelligence, provider).some((choice) => choice.model === model)
    ? intelligence.thinkingChoices
    : [];
}

export function isCompleteIntelligenceSelection(
  intelligence: HealthIntelligenceSummary,
  draft: IntelligenceSelectionDraft,
): boolean {
  if (!draft.inferenceProvider || !draft.model) return false;
  // Flat choice arrays are a display-only compatibility projection. They do
  // not prove that this model belongs to this provider, so only the qualified
  // provider-scoped projection may authorize a runtime reconfiguration.
  if (intelligence.selectionChoices.length === 0) return false;
  const provider = intelligence.selectionChoices.find((choice) => choice.provider === draft.inferenceProvider);
  const model = provider?.models.find((choice) => choice.model === draft.model);
  if (!provider || !model) return false;
  return model.thinkingChoices.length === 0 || Boolean(draft.thinking && model.thinkingChoices.includes(draft.thinking));
}

export function sameIntelligenceSelection(
  left: IntelligenceSelectionDraft,
  right: IntelligenceSelectionDraft,
): boolean {
  return left.inferenceProvider === right.inferenceProvider
    && left.model === right.model
    && left.thinking === right.thinking;
}
