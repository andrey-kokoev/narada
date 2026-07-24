import { computed, ref, watch, type Ref } from 'vue';
import { readJsonPreference, writeJsonPreference } from '../lib/browserPreferences.ts';

interface BoxVisibilityPreferenceOptions<TId extends string> {
  storageKey: string;
  itemIds: readonly TId[];
  defaultVisibleIds: readonly TId[];
  requiredIds?: readonly TId[];
  allowEmpty?: boolean;
  availableIds?: Ref<readonly TId[]>;
}

export function useBoxVisibilityPreference<TId extends string>(options: BoxVisibilityPreferenceOptions<TId>) {
  const visibleIds = ref(loadVisibleIds(options)) as Ref<Set<TId>>;
  const availableIdSet = computed(() => new Set(options.availableIds?.value ?? options.itemIds));
  const requiredIdSet = computed(() => new Set(options.requiredIds ?? []));
  const orderedVisibleIds = computed(() => options.itemIds.filter((id) => isVisible(id)));

  watch(visibleIds, (value) => persistVisibleIds(options, value));

  function isVisible(id: TId): boolean {
    return availableIdSet.value.has(id) && (visibleIds.value.has(id) || requiredIdSet.value.has(id));
  }

  function toggle(id: string) {
    if (!options.itemIds.includes(id as TId) || !availableIdSet.value.has(id as TId) || requiredIdSet.value.has(id as TId)) return;
    const next = new Set(visibleIds.value);
    if (next.has(id as TId)) next.delete(id as TId);
    else next.add(id as TId);
    visibleIds.value = next;
  }

  function reset() {
    visibleIds.value = new Set(options.defaultVisibleIds);
  }

  return { visibleIds, orderedVisibleIds, isVisible, toggle, reset };
}

function loadVisibleIds<TId extends string>(options: BoxVisibilityPreferenceOptions<TId>): Set<TId> {
  if (typeof window === 'undefined') return new Set(options.defaultVisibleIds);
  try {
    const parsed = readJsonPreference(options.storageKey, null) as unknown;
    if (!Array.isArray(parsed)) return new Set(options.defaultVisibleIds);
    const allowed = new Set(options.itemIds);
    const loaded = parsed.filter((id): id is TId => typeof id === 'string' && allowed.has(id as TId));
    if (loaded.length || (options.allowEmpty === true && parsed.length === 0)) return new Set(loaded);
    return new Set(options.defaultVisibleIds);
  } catch {
    return new Set(options.defaultVisibleIds);
  }
}

function persistVisibleIds<TId extends string>(options: BoxVisibilityPreferenceOptions<TId>, ids: Set<TId>) {
  if (typeof window === 'undefined') return;
  const orderedIds = options.itemIds.filter((id) => ids.has(id));
  writeJsonPreference(options.storageKey, orderedIds);
}
