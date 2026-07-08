<script setup lang="ts">
import { computed, ref } from 'vue';

export interface StatusBoxSelectorItem {
  id: string;
  label: string;
  description: string;
  visible: boolean;
  required?: boolean;
}

const props = defineProps<{
  boxes: StatusBoxSelectorItem[];
  panelId?: string;
  title?: string;
  description?: string;
  triggerLabel?: string;
  panelAriaLabel?: string;
  emptyText?: string;
  searchPlaceholder?: string;
  placement?: 'status-row' | 'inline';
}>();
const emit = defineEmits<{
  toggle: [id: string];
  reset: [];
}>();

const open = ref(false);
const searchText = ref('');
const visibleCount = computed(() => props.boxes.filter((box) => box.visible).length);
const boxCountLabel = computed(() => `${visibleCount.value}/${props.boxes.length}`);
const panelId = computed(() => props.panelId ?? 'status-box-selector-panel');
const title = computed(() => props.title ?? 'Status Boxes');
const description = computed(() => props.description ?? 'Select which boxes are shown in the session status row.');
const triggerTitle = computed(() => `${props.triggerLabel ?? 'Boxes'}: ${boxCountLabel.value} visible`);
const closeLabel = computed(() => `Close ${title.value.toLowerCase()}`);
const showSearch = computed(() => props.boxes.length >= 5);
const filteredBoxes = computed(() => {
  const query = searchText.value.trim().toLowerCase();
  if (!showSearch.value || !query) return props.boxes;
  return props.boxes.filter((box) => [box.id, box.label, box.description].some((value) => value.toLowerCase().includes(query)));
});
</script>

<template>
  <div class="status-box-selector-shell" :data-placement="props.placement ?? 'status-row'">
    <button type="button" class="status-box-selector-trigger" :aria-expanded="open" :aria-controls="panelId" :title="triggerTitle" :aria-label="`Choose ${props.triggerLabel ?? 'boxes'}`" @click="open = !open">
      <span class="status-box-selector-icon" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
        <span></span>
      </span>
    </button>
    <span class="status-box-selector-count" aria-hidden="true">{{ boxCountLabel }}</span>
    <Teleport to="body">
      <Transition name="mcp-drawer">
        <div v-if="open" class="mcp-drawer-layer" role="presentation">
          <button type="button" class="mcp-drawer-backdrop" :aria-label="closeLabel" @click="open = false"></button>
          <aside :id="panelId" class="mcp-panel status-box-selector-panel" :aria-label="props.panelAriaLabel ?? title">
            <header class="mcp-panel-header">
              <div>
                <h2>{{ title }}</h2>
                <p>{{ description }}</p>
              </div>
              <button type="button" class="mcp-panel-close" :aria-label="closeLabel" @click="open = false">Close</button>
            </header>
            <div class="status-box-selector-actions">
              <label v-if="showSearch" class="mcp-panel-search">
                <span>Search</span>
                <input v-model="searchText" type="search" autocomplete="off" spellcheck="false" :placeholder="props.searchPlaceholder ?? 'Filter boxes'" />
              </label>
              <span>{{ boxCountLabel }} visible</span>
              <button type="button" @click="emit('reset')">Reset</button>
            </div>
            <ol class="status-box-selector-list">
              <li v-for="box in filteredBoxes" :key="box.id" class="status-box-selector-item" :data-visible="box.visible">
                <label>
                  <input type="checkbox" :checked="box.visible" :disabled="box.required" @change="emit('toggle', box.id)" />
                  <span>
                    <strong>{{ box.label }}</strong>
                    <small>{{ box.description }}</small>
                  </span>
                </label>
              </li>
            </ol>
            <p v-if="!filteredBoxes.length" class="mcp-panel-empty">{{ props.emptyText ?? 'No matching boxes.' }}</p>
          </aside>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
