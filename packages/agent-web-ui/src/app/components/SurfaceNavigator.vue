<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';

interface SurfaceNavigatorItem {
  key: string;
  label: string;
  detail: string;
  available: boolean;
  unavailableMessage?: string;
}

interface SurfaceNavigatorGroup {
  title: string;
  items: SurfaceNavigatorItem[];
}

const props = defineProps<{
  groups: SurfaceNavigatorGroup[];
}>();
const emit = defineEmits<{
  open: [key: string];
}>();

const open = defineModel<boolean>('open', { default: false });
const search = ref('');
const searchInput = ref<HTMLInputElement | null>(null);

const availableItems = computed(() => props.groups.flatMap((group) => group.items).filter((item) => item.available));
const triggerLabel = computed(() => `Panels: ${availableItems.value.length}`);
const visibleGroups = computed(() => {
  const query = search.value.trim().toLowerCase();
  return props.groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (!query) return true;
        return [group.title, item.label, item.detail, item.unavailableMessage ?? ''].some((value) => value.toLowerCase().includes(query));
      }),
    }))
    .filter((group) => group.items.length > 0);
});

function openSurface(key: string) {
  emit('open', key);
  open.value = false;
}

function itemDetail(item: SurfaceNavigatorItem): string {
  return item.available ? item.detail : item.unavailableMessage ?? 'Capability is not advertised by the attached runtime.';
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  open.value = false;
}

watch(open, async (value) => {
  if (!value) return;
  await nextTick();
  searchInput.value?.focus();
});
</script>

<template>
  <div class="surface-navigator-shell">
    <button type="button" class="mcp-panel-trigger surface-navigator-trigger" :aria-expanded="open" aria-controls="surface-navigator-panel" @click="open = !open">
      <span class="chip-dot" aria-hidden="true"></span>
      <span>{{ triggerLabel }}</span>
    </button>
    <Teleport to="body">
      <Transition name="mcp-drawer">
        <div v-if="open" class="mcp-drawer-layer" role="presentation" @keydown="handleKeydown">
          <button type="button" class="mcp-drawer-backdrop" aria-label="Close surface navigator" @click="open = false"></button>
          <aside id="surface-navigator-panel" class="mcp-panel surface-navigator-panel" aria-label="Narada workflow and diagnostic panels">
            <header class="mcp-panel-header">
              <div>
                <h2>Session Panels</h2>
                <p>Work, automation, and diagnostics available in this session.</p>
              </div>
              <button type="button" class="mcp-panel-close" aria-label="Close surface navigator" @click="open = false">Close</button>
            </header>
            <div class="mcp-panel-actions">
              <label class="mcp-panel-search surface-navigator-search">
                <span>Search</span>
                <input ref="searchInput" v-model="search" type="search" autocomplete="off" spellcheck="false" placeholder="Filter panels" />
              </label>
            </div>
            <div class="surface-navigator-groups">
              <section v-for="group in visibleGroups" :key="group.title" class="surface-navigator-group">
                <h3>{{ group.title }}</h3>
                <ol class="surface-navigator-list narada-list-reset">
                  <li v-for="item in group.items" :key="item.key">
                    <button type="button" class="surface-navigator-row" :disabled="!item.available" :aria-disabled="!item.available" @click="item.available && openSurface(item.key)">
                      <span>
                        <strong>{{ item.label }}</strong>
                        <small>{{ itemDetail(item) }}</small>
                      </span>
                      <span aria-hidden="true">›</span>
                    </button>
                  </li>
                </ol>
              </section>
              <p v-if="!visibleGroups.length" class="mcp-panel-empty">No matching panels are available for this session.</p>
            </div>
          </aside>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
