import { computed, ref, watch } from 'vue';
import {
  NARS_CLIENT_PROJECTION_VERBOSITY_LEVELS,
  NARS_CLIENT_PROJECTION_DEFAULT_VERBOSITY,
  normalizeNarsClientProjectionVerbosity,
} from '../../runtime-events.ts';
import { AGENT_WEB_UI_PREFERENCE_KEYS, readJsonPreference, readStringPreference, writeJsonPreference, writeStringPreference } from '../lib/browserPreferences.ts';
import {
  BUILT_IN_PROJECTION_VIEWS,
  PROJECTION_VIEW_FACET_OPTIONS,
  customProjectionViewOption,
  isCanonicalProjectionVerbosity,
  normalizeCustomProjectionView,
  sanitizeCustomProjectionViews,
  transportVerbosityForFacets,
  type CustomProjectionView,
  type ProjectionViewDraft,
  type ProjectionViewOption,
} from '../lib/projectionViews';

export type ProjectionVerbosity = typeof NARS_CLIENT_PROJECTION_VERBOSITY_LEVELS[number];
export type { CustomProjectionView, ProjectionViewDraft, ProjectionViewOption } from '../lib/projectionViews';
const PROJECTION_VERBOSITY_STORAGE_KEY = AGENT_WEB_UI_PREFERENCE_KEYS.projectionVerbosity;
const PROJECTION_VIEWS_STORAGE_KEY = AGENT_WEB_UI_PREFERENCE_KEYS.projectionViews;
type StoredProjectionViews = {
  activeViewId?: string;
  customViews?: unknown;
};

export function useProjectionVerbosity(initial = NARS_CLIENT_PROJECTION_DEFAULT_VERBOSITY) {
  const fallbackVerbosity = loadProjectionVerbosity(initial);
  const persisted = loadProjectionViews(fallbackVerbosity);
  const customViews = ref<CustomProjectionView[]>(persisted.customViews);
  const viewId = ref(persisted.activeViewId);
  const verbosity = ref<ProjectionVerbosity>(canonicalVerbosityForView(viewId.value, customViews.value, fallbackVerbosity));
  const viewOptions = computed<readonly ProjectionViewOption[]>(() => [
    ...BUILT_IN_PROJECTION_VIEWS,
    ...customViews.value.map(customProjectionViewOption),
  ]);
  const activeView = computed(() => viewOptions.value.find((view) => view.id === viewId.value) ?? BUILT_IN_PROJECTION_VIEWS[0]);

  watch([viewId, customViews], () => persistProjectionViews(viewId.value, verbosity.value, customViews.value), { deep: true });

  function setView(value: string) {
    const selected = viewOptions.value.find((view) => view.id === value) ?? BUILT_IN_PROJECTION_VIEWS[0];
    viewId.value = selected.id;
    verbosity.value = selected.canonicalVerbosity as ProjectionVerbosity;
  }

  function saveCustomView(draft: ProjectionViewDraft): boolean {
    const id = draft.id?.trim() || createCustomViewId();
    const normalized = normalizeCustomProjectionView({
      id,
      label: draft.label,
      description: draft.description,
      facets: draft.facets,
    });
    if (!normalized) return false;
    const index = customViews.value.findIndex((view) => view.id === normalized.id);
    if (index < 0) customViews.value = [...customViews.value, normalized];
    else customViews.value = customViews.value.map((view, currentIndex) => currentIndex === index ? normalized : view);
    setView(normalized.id);
    return true;
  }

  function deleteCustomView(id: string) {
    if (!customViews.value.some((view) => view.id === id)) return;
    customViews.value = customViews.value.filter((view) => view.id !== id);
    if (viewId.value === id) setView('conversation');
  }

  return {
    levels: NARS_CLIENT_PROJECTION_VERBOSITY_LEVELS as readonly ProjectionVerbosity[],
    verbosity,
    viewId,
    viewOptions,
    activeView,
    customViews,
    facetOptions: PROJECTION_VIEW_FACET_OPTIONS,
    setView,
    setVerbosity: setView,
    saveCustomView,
    deleteCustomView,
  };
}

function loadProjectionViews(fallbackVerbosity: ProjectionVerbosity): { activeViewId: string; customViews: CustomProjectionView[] } {
  const legacyActiveViewId = loadProjectionVerbosity(fallbackVerbosity);
  if (typeof window === 'undefined') return { activeViewId: legacyActiveViewId, customViews: [] };
  const stored = readJsonPreference<StoredProjectionViews | null>(PROJECTION_VIEWS_STORAGE_KEY, null);
  const customViews = sanitizeCustomProjectionViews(stored?.customViews);
  const activeViewId = typeof stored?.activeViewId === 'string'
    && (isCanonicalProjectionVerbosity(stored.activeViewId) || customViews.some((view) => view.id === stored.activeViewId))
    ? stored.activeViewId
    : legacyActiveViewId;
  return { activeViewId, customViews };
}

function persistProjectionViews(activeViewId: string, verbosity: ProjectionVerbosity, customViews: readonly CustomProjectionView[]) {
  if (typeof window === 'undefined') return;
  writeJsonPreference(PROJECTION_VIEWS_STORAGE_KEY, { activeViewId, customViews });
  persistProjectionVerbosity(verbosity);
}

function canonicalVerbosityForView(viewId: string, customViews: readonly CustomProjectionView[], fallback: ProjectionVerbosity): ProjectionVerbosity {
  if (isCanonicalProjectionVerbosity(viewId)) return viewId as ProjectionVerbosity;
  const custom = customViews.find((view) => view.id === viewId);
  return custom ? transportVerbosityForFacets(custom.facets) as ProjectionVerbosity : fallback;
}

function createCustomViewId(): string {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().slice(0, 12)
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `custom:${random}`;
}

function loadProjectionVerbosity(fallback: string): ProjectionVerbosity {
  const normalizedFallback = normalizeNarsClientProjectionVerbosity(fallback) as ProjectionVerbosity;
  if (typeof window === 'undefined') return normalizedFallback;
  return normalizeNarsClientProjectionVerbosity(readStringPreference(PROJECTION_VERBOSITY_STORAGE_KEY, normalizedFallback)) as ProjectionVerbosity;
}

function persistProjectionVerbosity(value: ProjectionVerbosity) {
  if (typeof window === 'undefined') return;
  writeStringPreference(PROJECTION_VERBOSITY_STORAGE_KEY, value);
}
