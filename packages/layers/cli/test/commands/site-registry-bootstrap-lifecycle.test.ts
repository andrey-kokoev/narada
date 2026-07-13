import { describe, expect, it } from 'vitest';
import {
  createSiteRegistryBootstrapLifecycle,
  registryManagementLifecycle,
  transitionSiteRegistryBootstrapLifecycle,
} from '../../src/commands/site-registry-bootstrap-lifecycle.js';

describe('site registry and receiving-site bootstrap lifecycle', () => {
  it('models the complete paired receiving-site path', () => {
    let lifecycle = createSiteRegistryBootstrapLifecycle();
    for (const state of ['preflighted', 'planned', 'applying', 'user_site_created', 'pc_site_created', 'paired', 'verified'] as const) {
      lifecycle = transitionSiteRegistryBootstrapLifecycle(lifecycle, state);
    }
    expect(lifecycle.state).toBe('verified');
    expect(lifecycle.history).toEqual([
      'requested',
      'preflighted',
      'planned',
      'applying',
      'user_site_created',
      'pc_site_created',
      'paired',
      'verified',
    ]);
  });

  it('keeps registry preview and refusal outcomes distinct from applied state', () => {
    expect(registryManagementLifecycle({ apply: false, outcome: 'planned' }).state).toBe('planned');
    expect(registryManagementLifecycle({ apply: true, outcome: 'applied' }).state).toBe('verified');
    expect(registryManagementLifecycle({ apply: true, outcome: 'refused' }).state).toBe('refused');
    expect(registryManagementLifecycle({ apply: true, outcome: 'advisory' }).state).toBe('advisory');
  });

  it('does not allow pairing before both Site creation boundaries', () => {
    const planned = createSiteRegistryBootstrapLifecycle('planned');
    expect(() => transitionSiteRegistryBootstrapLifecycle(planned, 'paired')).toThrow(/invalid_site_registry_bootstrap_transition/);
  });
});
