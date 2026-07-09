<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import OperatorCommandPalette from './OperatorCommandPalette.vue';
import { useOperatorCommandPalette } from '../composables/useOperatorCommandPalette';
import { useOperatorInterruptPrompt } from '../composables/useOperatorInterruptPrompt';
import type { OperatorSnippet, OperatorSnippetDeliveryMode } from '../composables/useOperatorSnippets';

const draft = defineModel<string>({ required: true });
const props = defineProps<{ disabled?: boolean; disabledReason?: string; canInterrupt?: boolean; operatorSnippets?: OperatorSnippet[]; targetLabel?: string; targetState?: string }>();
const emit = defineEmits<{ submit: [deliveryMode?: OperatorSnippetDeliveryMode]; 'run-snippet': [snippet: OperatorSnippet, deliveryMode?: OperatorSnippetDeliveryMode]; interrupt: [] }>();
const inputRef = ref<HTMLTextAreaElement | null>(null);

const disabled = computed(() => Boolean(props.disabled));
const canInterrupt = computed(() => Boolean(props.canInterrupt));
const operatorSnippets = computed(() => props.operatorSnippets ?? []);
const focusInput = () => inputRef.value?.focus();

const {
  commandPaletteOpen,
  commandResults,
  commandPaletteView,
  selectedCommandIndex,
  activeCommandOptionId,
  acceptPaletteEntry,
  handlePaletteKeydown,
  isImmediateClick,
} = useOperatorCommandPalette({
  draft,
  disabled,
  operatorSnippets,
  focusInput,
  submit: (deliveryMode) => emit('submit', deliveryMode),
  runSnippet: (snippet, deliveryMode) => emit('run-snippet', snippet, deliveryMode),
});

const { interruptModalVisible, interruptCountdownLabel } = useOperatorInterruptPrompt({
  disabled,
  canInterrupt,
  commandPaletteOpen,
  interrupt: () => emit('interrupt'),
});

onMounted(async () => {
  await nextTick();
  focusInput();
});

function handleKeydown(event: KeyboardEvent) {
  if (handlePaletteKeydown(event)) return;
  if (event.key === 'Tab') {
    event.preventDefault();
    emit('submit', 'enqueue');
    return;
  }
  if (event.key !== 'Enter' || event.shiftKey) return;
  event.preventDefault();
  emit('submit', 'default');
}
</script>

<template>
  <form id="operator-form" class="composer" aria-label="Operator input" @submit.prevent="emit('submit', 'default')">
    <p class="composer-target" :data-state="disabled ? 'blocked' : 'active'">
      <span>{{ disabled ? 'Input blocked' : 'Sending to' }}</span>
      <strong>{{ props.targetLabel ?? 'current session' }}</strong>
      <template v-if="props.targetState">
        <span>· {{ props.targetState }}</span>
      </template>
    </p>
    <div class="composer-input-stack">
      <OperatorCommandPalette
        v-if="commandPaletteOpen"
        :entries="commandResults"
        :view="commandPaletteView"
        :selected-index="selectedCommandIndex"
        @select="selectedCommandIndex = $event"
        @accept="(entry) => acceptPaletteEntry(entry, isImmediateClick(entry))"
      />
      <textarea
        id="operator-input"
        ref="inputRef"
        v-model="draft"
        rows="3"
        autocomplete="off"
        spellcheck="true"
        placeholder="Enter to steer. Tab to queue. Shift+Enter for new line. Esc to interrupt"
        :disabled="disabled"
        :aria-expanded="commandPaletteOpen"
        :aria-activedescendant="commandPaletteOpen ? activeCommandOptionId : undefined"
        role="combobox"
        aria-haspopup="listbox"
        aria-autocomplete="list"
        aria-controls="agent-web-ui-command-palette-list"
        @keydown="handleKeydown"
      />
    </div>
    <button type="submit" :disabled="disabled">Send</button>
    <p v-if="disabled" class="composer-status">{{ disabledReason }}</p>
  </form>
  <Teleport to="body">
    <div v-if="interruptModalVisible" class="interrupt-confirm-layer" role="presentation">
      <div class="interrupt-confirm-modal" role="dialog" aria-modal="true" aria-live="assertive" aria-labelledby="interrupt-confirm-title">
        <strong id="interrupt-confirm-title">Press Esc again to interrupt the model</strong>
        <span>{{ interruptCountdownLabel }}</span>
      </div>
    </div>
  </Teleport>
</template>
