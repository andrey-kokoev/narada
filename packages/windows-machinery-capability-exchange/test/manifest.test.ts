import { describe, expect, it } from 'vitest';
import { buildWindowsMachineryAdoptionManifest } from '../src/index.js';

describe('windows machinery capability exchange manifest', () => {
  it('declares package adoption order without importing source state or granting live authority', () => {
    const manifest = buildWindowsMachineryAdoptionManifest();

    expect(manifest.status).toBe('descriptor_only');
    expect(manifest.packages).toContain('@narada2/windows-operator-surface');
    expect(manifest.source_state_imported).toBe(false);
    expect(manifest.non_portable_exclusions).toContain('PC runtime SQLite databases');
    expect(manifest.live_authority_not_granted).toContain('PC-locus mutation authority');
  });
});
