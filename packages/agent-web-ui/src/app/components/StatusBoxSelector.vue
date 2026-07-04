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
}>();
const emit = defineEmits<{
  toggle: [id: string];
  reset: [];
}>();

const open = ref(false);
const searchText = ref('');
const visibleCount = computed(() => props.boxes.filter((box) => box.visible).length);
const boxCountLabel = computed(() => `${visibleCount.value}/${props.boxes.length}`);
const showSearch = computed(() => props.boxes.length >= 5);
const filteredBoxes = computed(() => {
  const query = searchText.value.trim().toLowerCase();
  if (!showSearch.value || !query) return props.boxes;
  return props.boxes.filter((box) => [box.id, box.label, box.description].some((value) => value.toLowerCase().includes(query)));
});
</script>

<template>
  <div class="status-box-selector-shell">
    <button type="button" class="status-box-selector-trigger" :aria-expanded="open" aria-controls="status-box-selector-panel" @click="open = !open">
      <span class="label">Boxes</span>
      <span>{{ boxCountLabel }}</span>
    </button>
    <Teleport to="body">
      <Transition name="mcp-drawer">
        <div v-if="open" class="mcp-drawer-layer" role="presentation">
          <button type="button" class="mcp-drawer-backdrop" aria-label="Close status box selector" @click="open = false"></button>
          <aside id="status-box-selector-panel" class="mcp-panel status-box-selector-panel" aria-label="Status row boxes">
            <header class="mcp-panel-header">
              <div>
                <h2>Status Boxes</h2>
                <p>Select which boxes are shown in the session status row.</p>
              </div>
              <button type="button" class="mcp-panel-close" aria-label="Close status box selector" @click="open = false">Close</button>
            </header>
            <div class="status-box-selector-actions">
              <label v-if="showSearch" class="mcp-panel-search">
                <span>Search</span>
                <input v-model="searchText" type="search" autocomplete="off" spellcheck="false" placeholder="Filter boxes" />
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
            <p v-if="!filteredBoxes.length" class="mcp-panel-empty">No matching status boxes.</p>
          </aside>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
