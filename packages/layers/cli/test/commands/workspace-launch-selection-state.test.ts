import { describe, expect, it } from 'vitest';
import {
  initialOperatorSurfaceValues,
  initialRoleValuesForInteractiveSelection,
  normalizeInteractiveOperatorSurfaceValues,
  rememberedArraySelection,
  rememberedScalarSelection,
} from '../../src/commands/workspace-launch-selection-state.js';

describe('workspace launch selection state', () => {
  it('defaults role selection to resident when available', () => {
    expect(initialRoleValuesForInteractiveSelection(['architect', 'resident'])).toEqual(['resident']);
    expect(initialRoleValuesForInteractiveSelection(['architect'])).toEqual([]);
  });

  it('keeps remembered values only when they remain admitted', () => {
    expect(rememberedArraySelection([], ['sonar', 'missing'], ['sonar', 'staccato'], false)).toEqual(['sonar']);
    expect(rememberedScalarSelection(null, 'kimi-code-api', ['codex-subscription', 'kimi-code-api'], false, 'codex-subscription')).toBe('kimi-code-api');
    expect(rememberedScalarSelection(null, 'missing', ['codex-subscription'], false, 'codex-subscription')).toBe('codex-subscription');
  });

  it('treats registry default as a scalar operator-surface choice', () => {
    expect(initialOperatorSurfaceValues(['agent-cli', 'agent-web-ui'])).toEqual(['registry default']);
    expect(normalizeInteractiveOperatorSurfaceValues(['registry default', 'agent-web-ui'])).toEqual(['agent-web-ui']);
    expect(normalizeInteractiveOperatorSurfaceValues(['registry default'])).toEqual(['registry default']);
  });
});
