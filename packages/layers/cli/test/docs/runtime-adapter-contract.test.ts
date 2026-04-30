import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.unmock('node:fs');

const root = join(process.cwd(), '..', '..', '..');

describe('runtime-invariant adapter contract docs', () => {
  it('defines the required adapter protocol fields and two runtime substrate postures', () => {
    const protocol = JSON.parse(readFileSync(join(root, 'docs/product/narada.adapter_protocol.v0.json'), 'utf8'));

    expect(protocol.schema).toBe('narada.adapter_protocol.v0');
    expect(protocol.runtime_substrate_postures.map((posture: { substrate: string }) => posture.substrate)).toEqual([
      'node_cli',
      'powershell_windows',
    ]);
    expect(protocol).toHaveProperty('invocation_contract');
    expect(protocol).toHaveProperty('capability_declaration');
    expect(protocol).toHaveProperty('authority_binding');
    expect(protocol).toHaveProperty('evidence_contract');
    expect(protocol).toHaveProperty('dry_run_contract');
    expect(protocol).toHaveProperty('error_taxonomy');
    expect(protocol).toHaveProperty('idempotency');
    expect(protocol).toHaveProperty('secret_handling');
    expect(protocol).toHaveProperty('observability');
    expect(protocol).toHaveProperty('version_compatibility');
    expect(protocol.secret_handling.raw_secret_in_payload_forbidden).toBe(true);
  });

  it('audits representative surfaces by runtime, authority, storage, compliance, and residual gap', () => {
    const audit = JSON.parse(readFileSync(join(root, 'docs/product/runtime-adapter-contract-audit.json'), 'utf8'));

    expect(audit.schema).toBe('narada.adapter_audit.v0');
    expect(audit.surfaces.length).toBeGreaterThanOrEqual(3);
    for (const surface of audit.surfaces) {
      expect(surface.runtime_substrate).toBeTruthy();
      expect(surface.authority_locus).toBeTruthy();
      expect(surface.storage_substrate).toBeTruthy();
      expect(surface.adapter_protocol_posture).toMatch(/partial|planned|complete/);
      expect(surface.compliance.length).toBeGreaterThan(0);
      expect(surface.residual_gaps.length).toBeGreaterThan(0);
    }
  });
});
