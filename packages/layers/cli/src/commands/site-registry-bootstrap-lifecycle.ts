export const SITE_REGISTRY_BOOTSTRAP_LIFECYCLE_SCHEMA = 'narada.site_registry_bootstrap.lifecycle_state.v1' as const;

export const SITE_REGISTRY_BOOTSTRAP_LIFECYCLE_STATES = [
  'requested',
  'preflighted',
  'planned',
  'applying',
  'user_site_created',
  'pc_site_created',
  'paired',
  'verified',
  'advisory',
  'refused',
  'partial',
  'failed',
] as const;

export type SiteRegistryBootstrapLifecycleState = typeof SITE_REGISTRY_BOOTSTRAP_LIFECYCLE_STATES[number];

const TRANSITIONS: Record<SiteRegistryBootstrapLifecycleState, readonly SiteRegistryBootstrapLifecycleState[]> = {
  requested: ['preflighted', 'refused', 'failed'],
  preflighted: ['planned', 'refused', 'failed'],
  planned: ['applying', 'advisory', 'refused', 'failed'],
  applying: ['user_site_created', 'verified', 'refused', 'failed'],
  user_site_created: ['pc_site_created', 'partial', 'failed'],
  pc_site_created: ['paired', 'failed'],
  paired: ['verified', 'failed'],
  verified: [],
  advisory: [],
  refused: [],
  partial: [],
  failed: [],
};

export interface SiteRegistryBootstrapLifecycle {
  schema: typeof SITE_REGISTRY_BOOTSTRAP_LIFECYCLE_SCHEMA;
  state: SiteRegistryBootstrapLifecycleState;
  history: SiteRegistryBootstrapLifecycleState[];
}

export function canTransitionSiteRegistryBootstrapLifecycle(
  from: SiteRegistryBootstrapLifecycleState,
  to: SiteRegistryBootstrapLifecycleState,
): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export function createSiteRegistryBootstrapLifecycle(
  initialState: SiteRegistryBootstrapLifecycleState = 'requested',
): SiteRegistryBootstrapLifecycle {
  return {
    schema: SITE_REGISTRY_BOOTSTRAP_LIFECYCLE_SCHEMA,
    state: initialState,
    history: [initialState],
  };
}

export function transitionSiteRegistryBootstrapLifecycle(
  lifecycle: SiteRegistryBootstrapLifecycle,
  nextState: SiteRegistryBootstrapLifecycleState,
): SiteRegistryBootstrapLifecycle {
  if (!canTransitionSiteRegistryBootstrapLifecycle(lifecycle.state, nextState)) {
    throw new Error(`invalid_site_registry_bootstrap_transition: ${lifecycle.state}->${nextState}`);
  }
  if (lifecycle.state === nextState) return lifecycle;
  return {
    schema: SITE_REGISTRY_BOOTSTRAP_LIFECYCLE_SCHEMA,
    state: nextState,
    history: [...lifecycle.history, nextState],
  };
}

export function lifecycleEvidence(
  lifecycle: SiteRegistryBootstrapLifecycle,
): {
  lifecycle_schema: typeof SITE_REGISTRY_BOOTSTRAP_LIFECYCLE_SCHEMA;
  lifecycle_state: SiteRegistryBootstrapLifecycleState;
  lifecycle_history: SiteRegistryBootstrapLifecycleState[];
} {
  return {
    lifecycle_schema: lifecycle.schema,
    lifecycle_state: lifecycle.state,
    lifecycle_history: [...lifecycle.history],
  };
}

export function registryManagementLifecycle(args: {
  apply: boolean;
  outcome: 'planned' | 'applied' | 'refused' | 'advisory';
}): SiteRegistryBootstrapLifecycle {
  let lifecycle = createSiteRegistryBootstrapLifecycle();
  lifecycle = transitionSiteRegistryBootstrapLifecycle(lifecycle, 'preflighted');
  lifecycle = transitionSiteRegistryBootstrapLifecycle(lifecycle, 'planned');
  if (args.outcome === 'planned') return lifecycle;
  if (args.outcome === 'advisory') return transitionSiteRegistryBootstrapLifecycle(lifecycle, 'advisory');
  if (!args.apply) return transitionSiteRegistryBootstrapLifecycle(lifecycle, 'refused');
  lifecycle = transitionSiteRegistryBootstrapLifecycle(lifecycle, 'applying');
  return transitionSiteRegistryBootstrapLifecycle(lifecycle, args.outcome === 'applied' ? 'verified' : 'refused');
}
