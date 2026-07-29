import { describe, expect, it } from 'vitest';
import { healthIntelligence } from '../src/app/composables/useHealthStatus';

describe('healthIntelligence', () => {
  it('projects the active kernel binding when health exposes it', () => {
    expect(healthIntelligence({
      intelligence: {
        kernel: { provider: 'kimi-code-api', model: 'kimi-k2.7', thinking: 'medium' },
        latest_plan: {
          inference_provider: { id: 'inference-provider:codex-subscription' },
          model: { id: 'model:gpt-5.5' },
          options: { thinking: 'low' },
        },
      },
    })).toMatchObject({ provider: 'kimi-code-api', model: 'kimi-k2.7', thinking: 'medium' });
  });

  it('falls back to the canonical admitted plan for older runtimes without kernel fields', () => {
    expect(healthIntelligence({
      intelligence: {
        latest_plan: {
          inference_provider: { id: 'inference-provider:codex-subscription' },
          model: { id: 'model:gpt-5.5' },
          options: { thinking: 'low' },
        },
      },
    })).toMatchObject({ provider: 'codex-subscription', model: 'gpt-5.5', thinking: 'low' });
  });

  it('projects provider-scoped model and thinking capabilities', () => {
    expect(healthIntelligence({
      intelligence: {
        selection_choices: {
          providers: [{
            provider: 'kimi-code-api',
            models: [{ model: 'k3', thinking_choices: ['high', 'low', 'medium'] }],
          }],
        },
      },
    }).selectionChoices).toEqual([{
      provider: 'kimi-code-api',
      models: [{ model: 'k3', thinkingChoices: ['high', 'low', 'medium'] }],
    }]);
  });

  it('accepts array and resource-reference selection projections', () => {
    expect(healthIntelligence({
      intelligence: {
        selection_choices: [{
          provider: { kind: 'inference-provider', id: 'inference-provider:kimi-code-api' },
          models: [{ model: { kind: 'model', id: 'model:k3' }, thinking_choices: ['thinking'] }],
        }],
      },
    }).selectionChoices).toEqual([{
      provider: 'kimi-code-api',
      models: [{ model: 'k3', thinkingChoices: ['thinking'] }],
    }]);
  });

  it('retains qualified model identity and capability intersections', () => {
    expect(healthIntelligence({
      intelligence: {
        selection_choices: {
          schema: 'narada.invokable-intelligence.selection-choices.v1',
          providers: [{
            inference_provider: { kind: 'inference-provider', id: 'inference-provider:codex-subscription' },
            models: [{
              model_ref: { kind: 'model', id: 'model:gpt-5.6-luna' },
              model_provider: { kind: 'model-provider', id: 'model-provider:openai' },
              inference_provider: { kind: 'inference-provider', id: 'inference-provider:codex-subscription' },
              offering_refs: [{ kind: 'model-offering', id: 'model-offering:luna' }],
              invocation_model_key: 'gpt-5.6-luna',
              capabilities: [{
                capability: { family: 'thinking', name: 'levels' },
                supported: true,
                allowed_values: ['xhigh'],
                assertion_ids: ['assert:luna'],
                reasons: ['support-intersection-satisfied'],
              }],
            }],
          }],
        },
      },
    }).selectionChoices).toEqual([{
      provider: 'codex-subscription',
      models: [{
        model: 'gpt-5.6-luna',
        modelRef: 'gpt-5.6-luna',
        modelProvider: 'openai',
        offeringRefs: ['model-offering:luna'],
        invocationModelKey: 'gpt-5.6-luna',
        capabilities: [{ family: 'thinking', name: 'levels', supported: true, allowedValues: ['xhigh'] }],
        thinkingChoices: ['xhigh'],
      }],
    }]);
  });
});
