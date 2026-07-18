<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import BoxRowShell from './BoxRowShell.vue';
import BoxVisibilitySelector, { type BoxVisibilitySelectorItem } from './BoxVisibilitySelector.vue';
import OperatorCommandPalette from './OperatorCommandPalette.vue';
import { useBoxVisibilityPreference } from '../composables/useBoxVisibilityPreference';
import { useOperatorCommandPalette } from '../composables/useOperatorCommandPalette';
import { useOperatorInterruptPrompt } from '../composables/useOperatorInterruptPrompt';
import { isCaretOnFirstLine, isCaretOnLastLine, useComposerHistory } from '../composables/useComposerHistory';
import { AGENT_WEB_UI_PREFERENCE_KEYS } from '../lib/browserPreferences.js';
import type { OperatorSnippet, OperatorSnippetDeliveryMode } from '../composables/useOperatorSnippets';
import type { OperatorInputDeliveryProjection } from '../composables/useNarsEvents';

const draft = defineModel<string>({ required: true });
const props = defineProps<{ disabled?: boolean; disabledReason?: string; canInterrupt?: boolean; operatorSnippets?: OperatorSnippet[]; targetLabel?: string; targetState?: string; operatorDelivery: OperatorInputDeliveryProjection; supportsProtocolMethod?: (method: string) => boolean; lastSubmittedDraft: string; submittedDraftRevision: number }>();
const emit = defineEmits<{ submit: [deliveryMode?: OperatorSnippetDeliveryMode]; 'run-snippet': [snippet: OperatorSnippet, deliveryMode?: OperatorSnippetDeliveryMode]; 'retry-input': [content: string, requestId: string | null, idempotencyKey: string | null]; 'discard-input': [requestId: string | null]; interrupt: [] }>();
const inputRef = ref<HTMLTextAreaElement | null>(null);
const composerHistory = useComposerHistory();
let suppressDraftWatch = false;

watch(() => props.submittedDraftRevision, (revision, previousRevision) => {
  if (previousRevision === undefined || revision === previousRevision) return;
  composerHistory.recordSubmission(props.lastSubmittedDraft);
}, { flush: 'sync' });

watch(draft, () => {
  if (!suppressDraftWatch) composerHistory.leaveNavigation();
}, { flush: 'sync' });

const FOOTER_ITEM_STORAGE_KEY = AGENT_WEB_UI_PREFERENCE_KEYS.operatorFooterItems;
const FOOTER_ITEM_IDS = ['target', 'input'] as const;
type FooterItemId = typeof FOOTER_ITEM_IDS[number];
const DEFAULT_VISIBLE_FOOTER_ITEM_IDS: readonly FooterItemId[] = ['target', 'input'];
const footerItemDefinitions: Record<FooterItemId, Omit<BoxVisibilitySelectorItem, 'visible'>> = {
  target: { id: 'target', label: 'Target', description: 'Current NARS session target receiving operator input.' },
  input: { id: 'input', label: 'Operator Input', description: 'Composer textarea and send controls.' },
};

const disabled = computed(() => Boolean(props.disabled));
const canInterrupt = computed(() => Boolean(props.canInterrupt));
const operatorSnippets = computed(() => props.operatorSnippets ?? []);
const footerVisibility = useBoxVisibilityPreference({
  storageKey: FOOTER_ITEM_STORAGE_KEY,
  itemIds: FOOTER_ITEM_IDS,
  defaultVisibleIds: DEFAULT_VISIBLE_FOOTER_ITEM_IDS,
  allowEmpty: true,
});
const footerSelectorItems = computed(() => FOOTER_ITEM_IDS.map((id) => ({
  ...footerItemDefinitions[id],
  visible: footerVisibility.isVisible(id),
})));
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
  supportsProtocolMethod: props.supportsProtocolMethod,
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

function toggleFooterItem(id: string) {
  footerVisibility.toggle(id);
}

function resetFooterItems() {
  footerVisibility.reset();
}

function reviewRecoverableInput() {
  const content = props.operatorDelivery.content?.trim();
  if (!content) return;
  emit('retry-input', content, props.operatorDelivery.requestId, props.operatorDelivery.idempotencyKey);
}

function discardRecoverableInput() {
  emit('discard-input', props.operatorDelivery.requestId);
}

function replaceDraftFromHistory(value: string) {
  suppressDraftWatch = true;
  draft.value = value;
  suppressDraftWatch = false;
  nextTick(() => {
    focusInput();
    const textarea = inputRef.value;
    if (textarea) textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  });
}

function handleHistoryKeydown(event: KeyboardEvent): boolean {
  if (props.disabled || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return false;
  const textarea = event.currentTarget as HTMLTextAreaElement | null;
  if (!textarea || textarea.tagName !== 'TEXTAREA' || textarea.selectionStart !== textarea.selectionEnd) return false;
  const caretPosition = textarea.selectionStart;
  const lineEligible = event.key === 'ArrowUp'
    ? isCaretOnFirstLine(textarea.value, caretPosition)
    : isCaretOnLastLine(textarea.value, caretPosition);
  if (!lineEligible) return false;
  const result = composerHistory.navigate(event.key === 'ArrowUp' ? 'older' : 'newer', draft.value);
  if (!result.handled) return false;
  event.preventDefault();
  replaceDraftFromHistory(result.draft ?? '');
  return true;
}

function handleKeydown(event: KeyboardEvent) {
  if (handlePaletteKeydown(event)) return;
  if (handleHistoryKeydown(event)) return;
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
  <form
    id="operator-form"
    class="composer"
    aria-label="Operator input"
    :data-operator-delivery-phase="props.operatorDelivery.phase"
    :data-operator-delivery-request-id="props.operatorDelivery.requestId ?? undefined"
    @submit.prevent="emit('submit', 'default')"
  >
    <p v-if="footerVisibility.isVisible('target')" class="composer-target" :data-state="disabled ? 'blocked' : 'active'">
      <span>{{ disabled ? 'Input blocked' : 'Sending to' }}</span>
      <strong>{{ props.targetLabel ?? 'current session' }}</strong>
      <template v-if="props.targetState">
        <span>· {{ props.targetState }}</span>
      </template>
    </p>
    <BoxRowShell row-label="Operator input footer" class-name="operator-footer-row">
      <div class="composer-input-box">
        <div v-if="footerVisibility.isVisible('input')" class="composer-input-stack">
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
        <div class="composer-input-actions">
          <BoxVisibilitySelector
            :boxes="footerSelectorItems"
            panel-id="operator-footer-item-selector-panel"
            trigger-label="Operator footer items"
            title="Operator Footer Items"
            description="Select which controls are shown in the operator input row."
            panel-aria-label="Operator footer items"
            empty-text="No matching footer items."
            search-placeholder="Filter footer items"
            placement="inline"
            @toggle="toggleFooterItem"
            @reset="resetFooterItems"
          />
          <button v-if="footerVisibility.isVisible('input')" type="submit" class="composer-submit" :disabled="disabled">Send</button>
        </div>
      </div>
    </BoxRowShell>
    <p
      v-if="props.operatorDelivery.phase !== 'draft'"
      class="composer-delivery-status"
      :data-state="props.operatorDelivery.phase"
      aria-live="polite"
    >
      <strong>{{ props.operatorDelivery.label }}</strong>
      <span v-if="props.operatorDelivery.detail">· {{ props.operatorDelivery.detail }}</span>
      <button
        v-if="(props.operatorDelivery.phase === 'timed_out' || props.operatorDelivery.phase === 'reviewing') && props.operatorDelivery.content"
        type="button"
        class="composer-retry"
        :disabled="disabled"
        @click="reviewRecoverableInput"
      >
        Load for retry
      </button>
      <button
        v-if="(props.operatorDelivery.phase === 'timed_out' || props.operatorDelivery.phase === 'reviewing') && props.operatorDelivery.content"
        type="button"
        class="composer-discard"
        :disabled="disabled"
        @click="discardRecoverableInput"
      >
        Discard
      </button>
    </p>
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

<style scoped>
.composer-delivery-status {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  grid-column: 1 / -1;
  margin: -4px 0 0;
  color: var(--muted);
  font: 12px/1.35 var(--mono);
}

.composer-delivery-status[data-state="submitting"],
.composer-delivery-status[data-state="accepted"],
.composer-delivery-status[data-state="queued"],
.composer-delivery-status[data-state="steering"] {
  color: var(--accent);
}

.composer-delivery-status[data-state="rejected"],
.composer-delivery-status[data-state="failed"],
.composer-delivery-status[data-state="timed_out"] {
  color: var(--danger);
}

.composer-delivery-status[data-state="completed"] {
  color: var(--success, var(--muted));
}

.composer-retry {
  border: 0;
  padding: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}

.composer-discard {
  border: 0;
  padding: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}

.composer-retry:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
</style>
