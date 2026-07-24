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
});
