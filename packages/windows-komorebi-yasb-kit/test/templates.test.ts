import { describe, expect, it } from 'vitest';
import {
  buildKomorebiYasbHealthDescriptor,
  buildKomorebiYasbWorkspaceTemplate,
} from '../src/index.js';

describe('windows Komorebi/YASB descriptors', () => {
  it('requires receiving-Site parameters and fixture-safe health data', () => {
    const template = buildKomorebiYasbWorkspaceTemplate('fixture-template');
    const health = buildKomorebiYasbHealthDescriptor();

    expect(template.receiving_site_parameters_required).toBe(true);
    expect(template.live_monitor_state_imported).toBe(false);
    expect(health.fixture_data_only).toBe(true);
    expect(health.checks).toContain('rdp');
  });
});
