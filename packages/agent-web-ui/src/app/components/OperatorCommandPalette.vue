<script setup lang="ts">
import { computed } from 'vue';
import {
  OPERATOR_COMMAND_PALETTE_SECTION_LABELS,
  operatorCommandPaletteEntrySection,
  type OperatorCommandPaletteEntry,
  type OperatorCommandPaletteSection,
  type OperatorCommandPaletteView,
} from '../lib/operatorCommandController';
import { Command, CommandEmpty, CommandItem, CommandList } from './ui/command';

const props = defineProps<{
  entries: OperatorCommandPaletteEntry[];
  view: OperatorCommandPaletteView;
  selectedIndex: number;
}>();

const emit = defineEmits<{
  select: [index: number];
  accept: [entry: OperatorCommandPaletteEntry];
}>();

const sectionOrder: OperatorCommandPaletteSection[] = ['actions', 'snippets', 'commands'];
const sections = computed(() => sectionOrder
  .map((section) => ({
    id: section,
    label: OPERATOR_COMMAND_PALETTE_SECTION_LABELS[section],
    entries: props.entries
      .map((entry, index) => ({ entry, index }))
      .filter((item) => operatorCommandPaletteEntrySection(item.entry) === section),
  }))
  .filter((section) => section.entries.length));

function sectionLabelId(section: OperatorCommandPaletteSection): string {
  return `command-section-label-${section}`;
}
</script>

<template>
  <Command id="agent-web-ui-command-palette" class="command-palette">
    <header class="command-palette-header">
      <div>
        <strong>{{ view.title }}</strong>
        <p>{{ view.description }}</p>
      </div>
      <span>{{ view.hint }}</span>
    </header>
    <CommandList list-id="agent-web-ui-command-palette-list" label="Agent Web UI commands">
      <div v-for="section in sections" :key="section.id" class="command-section" role="group" :aria-labelledby="sectionLabelId(section.id)">
        <h3 :id="sectionLabelId(section.id)">{{ section.label }}</h3>
        <CommandItem
          v-for="{ entry, index } in section.entries"
          :key="entry.id"
          :option-id="`command-option-${entry.id}`"
          :active="index === selectedIndex"
          :danger="entry.danger"
          :class="{ 'command-option-snippet': entry.kind === 'snippet' }"
          @mouseenter="emit('select', index)"
          @click="emit('accept', entry)"
        >
          <span class="command-option-main">
            <code>{{ entry.slash }}</code>
            <span v-if="entry.kind === 'snippet'" class="command-option-badge">Snippet</span>
            <span v-else-if="entry.kind === 'snippet-action'" class="command-option-badge">Action</span>
            <strong>{{ entry.title }}</strong>
          </span>
          <span class="command-option-detail">{{ entry.description }}</span>
          <span class="command-option-meta">{{ entry.meta }}</span>
        </CommandItem>
      </div>
      <CommandEmpty v-if="!entries.length">
        <strong>{{ view.emptyText }}</strong>
        <span>{{ view.emptyHint }}</span>
      </CommandEmpty>
    </CommandList>
  </Command>
</template>
