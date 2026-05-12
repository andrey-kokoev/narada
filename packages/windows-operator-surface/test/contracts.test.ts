import { describe, expect, it } from 'vitest';
import {
  buildOperatorSurfaceBindingDescriptor,
  buildOperatorSurfaceHealthDescriptor,
} from '../src/index.js';

describe('windows operator surface descriptors', () => {
  it('keeps identity projection descriptor-only and fixture-safe', () => {
    const descriptor = buildOperatorSurfaceBindingDescriptor({
      surface_id: 'surface.fixture.architect',
      receiving_site_id: 'neutral-site',
      identity_id: 'neutral-site.agent.alex',
      role_name: 'architect',
    });

    expect(descriptor.live_hwnd_imported).toBe(false);
    expect(descriptor.source_identity_authority_imported).toBe(false);
    expect(descriptor.source_hwnd_ref).toBe('fixture');
  });

  it('names PC authority requirement without mutating runtime state', () => {
    const health = buildOperatorSurfaceHealthDescriptor('surface.fixture.architect');

    expect(health.status).toBe('carrier_missing');
    expect(health.compact_repair_result).toBe('separate_pc_authority_required');
    expect(health.pc_runtime_mutated).toBe(false);
  });
});
