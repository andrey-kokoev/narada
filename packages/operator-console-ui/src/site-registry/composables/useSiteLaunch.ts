import { ref, type Ref } from 'vue';
import { createSiteRegistryAdapter, type SiteLaunchResult, type SiteRegistryClient } from '../adapter';

export interface UseSiteLaunchState {
  result: Ref<SiteLaunchResult | null>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  launch: (siteId: string, dryRun: boolean) => Promise<void>;
  reset: () => void;
}

/**
 * Per-site launch/ensure action against POST /console/registry/api/sites/:id/launch.
 * Plan-first: callers pass dryRun=true for posture checks and dryRun=false only
 * behind an explicit operator confirm.
 */
export function useSiteLaunch(client: SiteRegistryClient = createSiteRegistryAdapter()): UseSiteLaunchState {
  const result = ref<SiteLaunchResult | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function launch(siteId: string, dryRun: boolean): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      result.value = await client.launch(siteId, dryRun);
    } catch (cause) {
      result.value = null;
      error.value = cause instanceof Error ? cause.message : 'Site launch request failed.';
    } finally {
      loading.value = false;
    }
  }

  function reset(): void {
    result.value = null;
    error.value = null;
  }

  return { result, loading, error, launch, reset };
}
