import { describe, expect, it } from 'vitest';
import { classifyOperatorInput } from '../src/input/operator-input.js';
import { fuzzyFilter } from '../src/input/fuzzy-selector.js';

describe('agent-pi-tui input boundary', () => {
  it('keeps ordinary input on the canonical session.submit path', () => {
    const result: any = classifyOperatorInput('hello NARS');
    expect(result.kind).toBe('conversation');
    if (result.kind !== 'conversation') throw new Error('expected conversation');
    expect(result.frame.method).toBe('session.submit');
    expect(result.frame.params?.idempotency_key).toEqual(expect.any(String));
  });

  it('uses one qualified target for intelligence reconfiguration', () => {
    const result: any = classifyOperatorInput('/intelligence codex-subscription gpt-test high');
    expect(result.kind).toBe('known_slash');
    if (result.kind !== 'known_slash' || !result.frame) throw new Error('expected protocol frame');
    expect(result.frame.method).toBe('runtime.intelligence.reconfigure');
    expect(result.frame.params).toMatchObject({
      requested_inference_provider: { kind: 'inference-provider', id: 'inference-provider:codex-subscription' },
      requested_model: { kind: 'model', id: 'model:gpt-test' },
      requested_options: { thinking: 'high' },
    });
    expect(classifyOperatorInput('/model gpt-test').kind).toBe('unknown_slash');
  });

  it('does not forward unknown slash or shell input', () => {
    expect(classifyOperatorInput('/does-not-exist').kind).toBe('unknown_slash');
    const shell: any = classifyOperatorInput('!Get-ChildItem');
    expect(shell.kind).toBe('unavailable_shell');
  });

  it('keeps presentation commands local', () => {
    const result: any = classifyOperatorInput('/view operations');
    expect(result).toMatchObject({ kind: 'known_slash', local: { kind: 'view', view: 'operations' } });
  });

  it('ranks selector options locally without invoking NARS', () => {
    expect(fuzzyFilter('mod', [
      { value: 'model', label: 'Model' },
      { value: 'provider', label: 'Provider' },
      { value: 'thinking', label: 'Thinking' },
    ])[0]?.value).toBe('model');
  });
});
