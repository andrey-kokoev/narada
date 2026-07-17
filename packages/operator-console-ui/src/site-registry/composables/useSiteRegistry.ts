import { computed, onMounted, ref, type Ref } from 'vue';
import type { RegistrySiteRecord } from '@narada2/site-registry-contract';
import { OPERATOR_CONSOLE_REGISTRY_PATH } from '@narada2/operator-console-contract';
import {
  toSiteDetailProjection,
  toSiteListProjection,
  toSiteTileProjection,
  type SiteDetailProjection,
  type SiteListProjection,
  type SiteTileProjection,
} from '../projections';
import { operatorConsoleNavigationHref } from '../../console/routes';
import { useOperatorWorkspaceRouteDirectory } from '../../console/route-directory';
import {
  SiteRegistryApiError,
  createSiteRegistryAdapter,
  type SiteRegistryClient,
} from '../adapter';

export { SiteRegistryApiError, createSiteRegistryAdapter } from '../adapter';
export type { SiteRegistryClient } from '../adapter';

export interface UseSiteRegistryState {
  records: Ref<RegistrySiteRecord[]>;
  sites: Ref<SiteListProjection[]>;
  tiles: Ref<SiteTileProjection[]>;
  selectedSiteId: Ref<string | null>;
  selectedRecord: Ref<RegistrySiteRecord | null>;
  selected: Ref<SiteDetailProjection | null>;
  loading: Ref<boolean>;
  loadingDetail: Ref<boolean>;
  error: Ref<string | null>;
  listStale: Ref<boolean>;
  lastSuccessfulLoadAt: Ref<string | null>;
  load: () => Promise<void>;
  select: (reference: string) => Promise<void>;
  clearSelection: () => void;
}

export function useSiteRegistry(client: SiteRegistryClient = createSiteRegistryAdapter()): UseSiteRegistryState {
  const routeDirectory = useOperatorWorkspaceRouteDirectory();
  const records = ref<RegistrySiteRecord[]>([]);
  const selectedSiteId = ref<string | null>(null);
  const selectedRecord = ref<RegistrySiteRecord | null>(null);
  const loading = ref(false);
  const loadingDetail = ref(false);
  const error = ref<string | null>(null);
  const listStale = ref(false);
  const lastSuccessfulLoadAt = ref<string | null>(null);
  const projectionPaths = computed(() => ({
    registryPath: operatorConsoleNavigationHref(
      routeDirectory?.directory.value,
      'sites',
      OPERATOR_CONSOLE_REGISTRY_PATH,
    ),
  }));
  const sites = computed(() => records.value.map((site) => toSiteListProjection(site, Date.now(), projectionPaths.value)));
  const tiles = computed(() => records.value.map((site) => toSiteTileProjection(site, Date.now(), projectionPaths.value)));
  const selected = computed(() => selectedRecord.value
    ? toSiteDetailProjection(selectedRecord.value, Date.now(), projectionPaths.value)
    : null);

  async function load(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const response = await client.list();
      if (response.status === 'refused') throw new SiteRegistryApiError('refused', 'Registry refused the list request.', response.refusals);
      records.value = response.sites;
      listStale.value = false;
      lastSuccessfulLoadAt.value = new Date().toISOString();
      if (selectedSiteId.value && !records.value.some((site) => site.siteId === selectedSiteId.value)) clearSelection();
    } catch (cause) {
      listStale.value = true;
      error.value = cause instanceof Error ? cause.message : 'Registry list request failed.';
    } finally {
      loading.value = false;
    }
  }

  async function select(reference: string): Promise<void> {
    loadingDetail.value = true;
    error.value = null;
    selectedSiteId.value = reference;
    try {
      const response = await client.show(reference);
      if (response.status === 'refused' || !response.site) throw new SiteRegistryApiError('refused', 'Registry refused the Site detail request.', response.refusals);
      selectedSiteId.value = response.site.siteId;
      selectedRecord.value = response.site;
    } catch (cause) {
      clearSelection();
      error.value = cause instanceof Error ? cause.message : 'Registry detail request failed.';
    } finally {
      loadingDetail.value = false;
    }
  }

  function clearSelection(): void {
    selectedSiteId.value = null;
    selectedRecord.value = null;
  }

  onMounted(() => { void load(); });

  return {
    records,
    sites,
    tiles,
    selectedSiteId,
    selectedRecord,
    selected,
    loading,
    loadingDetail,
    error,
    listStale,
    lastSuccessfulLoadAt,
    load,
    select,
    clearSelection,
  };
}
