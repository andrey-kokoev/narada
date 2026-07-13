import { computed, onMounted, ref, type Ref } from 'vue';
import {
  parseSiteRegistryListResponse,
  parseSiteRegistryShowResponse,
  type RegistrySiteRecord,
  type SiteRegistryMutationRequest,
} from '@narada2/site-registry-contract';
import {
  toSiteDetailProjection,
  toSiteListProjection,
  toSiteTileProjection,
  type SiteDetailProjection,
  type SiteListProjection,
  type SiteTileProjection,
} from '../projections';

export interface SiteRegistryClient {
  list(): Promise<unknown>;
  show(reference: string): Promise<unknown>;
  plan(request: SiteRegistryMutationRequest): Promise<unknown>;
  apply(request: SiteRegistryMutationRequest): Promise<unknown>;
}

export class SiteRegistryApiError extends Error {
  readonly code: string;
  readonly refusals: string[];

  constructor(code: string, message: string, refusals: string[] = []) {
    super(message);
    this.name = 'SiteRegistryApiError';
    this.code = code;
    this.refusals = refusals;
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new SiteRegistryApiError('invalid_json', `Registry returned HTTP ${response.status} without valid JSON.`);
  }
}

function createRequestClient(basePath: string, fetchLike: FetchLike): SiteRegistryClient {
  async function get(path: string): Promise<unknown> {
    const response = await fetchLike(`${basePath}${path}`, { headers: { Accept: 'application/json' } });
    const payload = await readJson(response);
    if (!response.ok) throw new SiteRegistryApiError('http_error', `Registry request failed with HTTP ${response.status}.`);
    return payload;
  }

  async function post(path: string, request: SiteRegistryMutationRequest, confirmApply: boolean): Promise<unknown> {
    const response = await fetchLike(`${basePath}${path}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(confirmApply ? { ...request, confirm_apply: true } : request),
    });
    const payload = await readJson(response);
    if (!response.ok && response.status !== 409) throw new SiteRegistryApiError('http_error', `Registry request failed with HTTP ${response.status}.`);
    return payload;
  }

  return {
    list: () => get('/sites'),
    show: (reference) => get(`/sites/${encodeURIComponent(reference)}`),
    plan: (request) => post('/operations/plan', request, false),
    apply: (request) => post('/operations/apply', request, true),
  };
}

export function createSiteRegistryClient(
  basePath = '/console/registry/api',
  fetchLike: FetchLike = (input, init) => fetch(input, init),
): SiteRegistryClient {
  return createRequestClient(basePath, fetchLike);
}

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
  load: () => Promise<void>;
  select: (reference: string) => Promise<void>;
  clearSelection: () => void;
}

export function useSiteRegistry(client = createSiteRegistryClient()): UseSiteRegistryState {
  const records = ref<RegistrySiteRecord[]>([]);
  const selectedSiteId = ref<string | null>(null);
  const selectedRecord = ref<RegistrySiteRecord | null>(null);
  const loading = ref(false);
  const loadingDetail = ref(false);
  const error = ref<string | null>(null);
  const sites = computed(() => records.value.map((site) => toSiteListProjection(site)));
  const tiles = computed(() => records.value.map((site) => toSiteTileProjection(site)));
  const selected = computed(() => selectedRecord.value ? toSiteDetailProjection(selectedRecord.value) : null);

  async function load(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const response = parseSiteRegistryListResponse(await client.list());
      if (!response) throw new SiteRegistryApiError('invalid_response', 'Registry list response did not match its contract.');
      if (response.status === 'refused') throw new SiteRegistryApiError('refused', 'Registry refused the list request.', response.refusals);
      records.value = response.sites;
      if (selectedSiteId.value && !records.value.some((site) => site.siteId === selectedSiteId.value)) clearSelection();
    } catch (cause) {
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
      const response = parseSiteRegistryShowResponse(await client.show(reference));
      if (!response) throw new SiteRegistryApiError('invalid_response', 'Registry detail response did not match its contract.');
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

  return { records, sites, tiles, selectedSiteId, selectedRecord, selected, loading, loadingDetail, error, load, select, clearSelection };
}
