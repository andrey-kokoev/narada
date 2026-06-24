import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildWindowsShellEnvelope, decideWindowsShellPolicy } from '../src/index.js';
import { resolveAgentPathPolicy } from '../support/path-policy.mjs';

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

  it('makes support path-policy roster membership site opt-in', () => {
    const siteRoot = mkdtempSync(join(tmpdir(), 'narada-shell-path-policy-'));
    try {
      mkdirSync(join(siteRoot, '.ai', 'agents'), { recursive: true });
      const rosterPath = join(siteRoot, '.ai', 'agents', 'roster.json');

      writeFileSync(rosterPath, JSON.stringify({ agents: [] }), 'utf8');
      expect(resolveAgentPathPolicy(siteRoot, 'narada.architect')).toMatchObject({
        configured: false,
        allowed: true,
        roster_enforcement: 'disabled',
        reason: 'identity_not_in_roster_but_site_path_roster_enforcement_not_enabled',
      });

      writeFileSync(rosterPath, JSON.stringify({ enforce_agent_path_policy: true, agents: [] }), 'utf8');
      expect(resolveAgentPathPolicy(siteRoot, 'narada.architect')).toMatchObject({
        configured: true,
        allowed: false,
        roster_enforcement: 'enabled',
        error: 'path_policy_identity_not_in_roster: narada.architect',
      });
    } finally {
      rmSync(siteRoot, { recursive: true, force: true });
    }
  });
});
