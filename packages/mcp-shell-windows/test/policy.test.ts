import { describe, expect, it } from 'vitest';
import { buildWindowsShellEnvelope, decideWindowsShellPolicy } from '../src/index.js';

describe('windows shell MCP descriptors', () => {
  it('allows descriptor-only read requests without granting live shell authority', () => {
    const envelope = buildWindowsShellEnvelope({
      command: 'Get-ChildItem',
      category: 'read_only',
      authority_basis: 'fixture-authority',
    });
    const decision = decideWindowsShellPolicy(envelope);

    expect(envelope.executed).toBe(false);
    expect(decision.status).toBe('allowed_descriptor');
    expect(decision.live_shell_authority_granted).toBe(false);
  });

  it('refuses raw WSL crossings and break-glass without local admission', () => {
    const decision = decideWindowsShellPolicy(buildWindowsShellEnvelope({
      command: 'wsl.exe',
      category: 'break_glass',
      authority_basis: 'fixture-authority',
    }));

    expect(decision.status).toBe('refused');
    expect(decision.reasons).toContain('raw_wsl_crossing_refused');
    expect(decision.reasons).toContain('break_glass_requires_receiving_site_admission');
  });
});
