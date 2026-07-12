import { ref, type Ref } from 'vue';
import {
  parseSiteRegistryManagementResponse,
  type SiteRegistryManagementResponse,
  type SiteRegistryMutationRequest,
} from '@narada2/site-registry-contract';
import { SiteRegistryApiError, createSiteRegistryClient, type SiteRegistryClient } from './useSiteRegistry';

export type SiteRegistryMutationState = 'idle' | 'planning' | 'applying' | 'complete' | 'error';

export interface UseSiteRegistryMutationState {
  state: Ref<SiteRegistryMutationState>;
  result: Ref<SiteRegistryManagementResponse | null>;
  error: Ref<string | null>;
  plan: (request: SiteRegistryMutationRequest) => Promise<SiteRegistryManagementResponse | null>;
  apply: (request: SiteRegistryMutationRequest) => Promise<SiteRegistryManagementResponse | null>;
}

export function useSiteRegistryMutation(client: SiteRegistryClient = createSiteRegistryClient()): UseSiteRegistryMutationState {
  const state = ref<SiteRegistryMutationState>('idle');
  const result = ref<SiteRegistryManagementResponse | null>(null);
  const error = ref<string | null>(null);

  async function execute(request: SiteRegistryMutationRequest, mode: 'plan' | 'apply'): Promise<SiteRegistryManagementResponse | null> {
    state.value = mode === 'plan' ? 'planning' : 'applying';
    error.value = null;
    try {
      const payload = mode === 'plan' ? await client.plan(request) : await client.apply(request);
      const parsed = parseSiteRegistryManagementResponse(payload);
      if (!parsed) throw new SiteRegistryApiError('invalid_response', 'Registry mutation response did not match its contract.');
      result.value = parsed;
      state.value = parsed.status === 'refused' ? 'error' : 'complete';
      if (parsed.status === 'refused') error.value = parsed.refusals.join('; ') || 'Registry refused the operation.';
      return parsed;
    } catch (cause) {
      state.value = 'error';
      error.value = cause instanceof Error ? cause.message : 'Registry mutation failed.';
      return null;
    }
  }

  return {
    state,
    result,
    error,
    plan: (request) => execute(request, 'plan'),
    apply: (request) => execute(request, 'apply'),
  };
}
