import { describe, expect, it } from 'vitest';
import {
  isCompleteIntelligenceSelection,
  modelsForProvider,
  providerChoicesFor,
  thinkingChoicesFor,
  type IntelligenceSelectionDraft,
} from '../src/app/lib/intelligenceSelection';
import type { HealthIntelligenceSummary } from '../src/app/composables/useHealthStatus';

const intelligence: HealthIntelligenceSummary = {
  provider: 'codex-subscription',
  model: 'gpt-5.5',
  thinking: 'medium',
  providerChoices: ['codex-subscription', 'kimi-code-api'],
  modelChoices: ['gpt-5.5', 'k3'],
  thinkingChoices: [],
  selectionChoices: [
    {
      provider: 'codex-subscription',
      models: [{ model: 'gpt-5.5', thinkingChoices: ['low', 'medium', 'high'] }],
    },
    {
      provider: 'kimi-code-api',
      models: [{ model: 'k3', thinkingChoices: ['low', 'medium', 'high'] }],
    },
  ],
};

describe('intelligence selection', () => {
  it('scopes models and thinking choices by the selected provider/model', () => {
    expect(modelsForProvider(intelligence, 'kimi-code-api')).toEqual([
      { model: 'k3', thinkingChoices: ['low', 'medium', 'high'] },
    ]);
    expect(thinkingChoicesFor(intelligence, 'kimi-code-api', 'k3')).toEqual(['low', 'medium', 'high']);
  });

  it('rejects incomplete or capability-inconsistent drafts', () => {
    const drafts: IntelligenceSelectionDraft[] = [
      { inferenceProvider: 'kimi-code-api', model: null, thinking: null },
      { inferenceProvider: 'codex-subscription', model: 'k3', thinking: 'medium' },
      { inferenceProvider: 'kimi-code-api', model: 'k3', thinking: null },
    ];
    for (const draft of drafts) expect(isCompleteIntelligenceSelection(intelligence, draft)).toBe(false);
    expect(isCompleteIntelligenceSelection(intelligence, {
      inferenceProvider: 'kimi-code-api',
      model: 'k3',
      thinking: 'high',
    })).toBe(true);
  });

  it('uses flat health choices for dropdown display without authorizing an unqualified draft', () => {
    const legacyIntelligence: HealthIntelligenceSummary = {
      ...intelligence,
      selectionChoices: [],
      providerChoices: ['codex-subscription'],
      modelChoices: ['gpt-5.5'],
      thinkingChoices: [],
    };

    expect(providerChoicesFor(legacyIntelligence)).toEqual([
      { provider: 'codex-subscription', models: [] },
    ]);
    expect(modelsForProvider(legacyIntelligence, 'codex-subscription')).toEqual([
      { model: 'gpt-5.5', thinkingChoices: [] },
    ]);
    expect(isCompleteIntelligenceSelection(legacyIntelligence, {
      inferenceProvider: 'codex-subscription',
      model: 'gpt-5.5',
      thinking: null,
    })).toBe(false);
  });

  it('does not cross-wire a flat global model list across multiple providers', () => {
    const legacyIntelligence: HealthIntelligenceSummary = {
      ...intelligence,
      selectionChoices: [],
      providerChoices: ['codex-subscription', 'kimi-code-api'],
      modelChoices: ['gpt-5.5', 'k3'],
      thinkingChoices: [],
    };

    expect(modelsForProvider(legacyIntelligence, 'kimi-code-api')).toEqual([]);
    expect(thinkingChoicesFor(legacyIntelligence, 'kimi-code-api', 'k3')).toEqual([]);
  });

  it('requires the canonical model reference when a qualified choice provides one', () => {
    const qualified: HealthIntelligenceSummary = {
      ...intelligence,
      selectionChoices: [{
        provider: 'codex-subscription',
        models: [{ model: 'luna', modelRef: 'gpt-5.6-luna', thinkingChoices: ['xhigh'] }],
      }],
    };
    expect(isCompleteIntelligenceSelection(qualified, {
      inferenceProvider: 'codex-subscription',
      model: 'luna',
      thinking: 'xhigh',
    })).toBe(false);
    expect(isCompleteIntelligenceSelection(qualified, {
      inferenceProvider: 'codex-subscription',
      model: 'luna',
      modelRef: 'gpt-5.6-luna',
      thinking: 'xhigh',
    })).toBe(true);
  });
});
