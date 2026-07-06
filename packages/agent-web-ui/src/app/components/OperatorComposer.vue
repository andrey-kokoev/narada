<script setup lang="ts">
import { filterAgentWebUiCommands, type AgentWebUiCommand } from '@narada2/nars-client-projection-contract';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { OperatorSnippet } from '../composables/useOperatorSnippets';

const draft = defineModel<string>({ required: true });
const props = defineProps<{ disabled?: boolean; disabledReason?: string; canInterrupt?: boolean; operatorSnippets?: OperatorSnippet[] }>();
const emit = defineEmits<{ submit: [deliveryMode?: 'default' | 'enqueue']; 'run-snippet': [snippet: OperatorSnippet, deliveryMode?: 'default' | 'enqueue']; interrupt: [] }>();
const inputRef = ref<HTMLTextAreaElement | null>(null);
const interruptArmed = ref(false);
const interruptModalVisible = ref(false);
const interruptCountdown = ref(3);
const commandPaletteDismissedFor = ref<string | null>(null);
const selectedCommandIndex = ref(0);
let interruptShowTimer: ReturnType<typeof setTimeout> | null = null;
let interruptCountdownTimer: ReturnType<typeof setInterval> | null = null;

const interruptCountdownLabel = computed(() => `${interruptCountdown.value}s`);
const commandQuery = computed(() => {
  if (!draft.value.startsWith('/')) return '';
  return draft.value.slice(1).split(/\s+/)[0] ?? '';
});
const commandPaletteOpen = computed(() => draft.value.startsWith('/') && draft.value !== commandPaletteDismissedFor.value && !props.disabled);
type PaletteEntry =
  | { kind: 'command'; command: AgentWebUiCommand; id: string; slash: string; title: string; description: string; meta: string; danger: boolean }
  | { kind: 'snippet'; snippet: OperatorSnippet; deliveryMode: 'default' | 'enqueue'; id: string; slash: string; title: string; description: string; meta: string; danger: false };

const commandResults = computed<PaletteEntry[]>(() => {
  const commands: PaletteEntry[] = filterAgentWebUiCommands(commandQuery.value).map((command) => ({
    kind: 'command',
    command,
    id: command.id,
    slash: command.slash,
    title: command.title,
    description: command.description,
    meta: command.group,
    danger: command.palette.danger,
  }));
  const snippetVerb = currentSnippetVerb();
  const snippetResults = filterSnippetResults(commandQuery.value).map((snippet) => ({
    kind: 'snippet' as const,
    snippet,
    deliveryMode: snippetVerb === 'enqueue' ? 'enqueue' as const : 'default' as const,
    id: `snippet-${snippet.id}`,
    slash: `/snippet ${snippetVerb} ${snippet.name}`,
    title: snippet.name,
    description: snippet.body.slice(0, 120),
    meta: [snippet.pinned ? 'pinned' : 'snippet', snippetVerb === 'enqueue' ? 'queue' : 'run', snippet.last_used_at ? `used ${snippet.use_count ?? 0}` : null].filter(Boolean).join(' / '),
    danger: false as const,
  }));
  const snippetRunMode = /^\/snippet\s+(run|send|enqueue)\s+/i.test(draft.value.trim());
  return (snippetRunMode ? [...snippetResults, ...commands] : [...commands, ...snippetResults]).slice(0, 8);
});

watch(commandResults, (commands) => {
  if (!commands.length || selectedCommandIndex.value >= commands.length) selectedCommandIndex.value = 0;
});

watch(() => props.canInterrupt, (canInterrupt) => {
  if (!canInterrupt) clearInterruptPrompt();
});

onMounted(async () => {
  await nextTick();
  inputRef.value?.focus();
  window.addEventListener('keydown', handleGlobalKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeydown);
  clearInterruptPrompt();
});

function handleKeydown(event: KeyboardEvent) {
  if (commandPaletteOpen.value && event.key === 'Escape') {
    event.preventDefault();
    commandPaletteDismissedFor.value = draft.value;
    return;
  }
  if (commandPaletteOpen.value && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    event.preventDefault();
    moveCommandSelection(event.key === 'ArrowDown' ? 1 : -1);
    return;
  }
  if (commandPaletteOpen.value && event.key === 'Tab') {
    event.preventDefault();
    acceptSelectedCommand(false);
    return;
  }
  if (commandPaletteOpen.value && event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    acceptSelectedCommand(true);
    return;
  }
  if (event.key === 'Tab') {
    event.preventDefault();
    emit('submit', 'enqueue');
    return;
  }
  if (event.key !== 'Enter' || event.shiftKey) return;
  event.preventDefault();
  emit('submit', 'default');
}

function currentSnippetVerb(): 'run' | 'send' | 'enqueue' {
  const match = /^\/snippet\s+(run|send|enqueue)\b/i.exec(draft.value.trim());
  const verb = match?.[1]?.toLowerCase();
  if (verb === 'send' || verb === 'enqueue') return verb;
  return 'run';
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented || props.disabled || !props.canInterrupt || commandPaletteOpen.value) return;
  event.preventDefault();
  if (interruptArmed.value) {
    sendInterrupt();
    return;
  }
  armInterruptPrompt();
}

function armInterruptPrompt() {
  interruptArmed.value = true;
  interruptCountdown.value = 3;
  interruptShowTimer = setTimeout(() => {
    interruptModalVisible.value = true;
    interruptCountdownTimer = setInterval(() => {
      interruptCountdown.value -= 1;
      if (interruptCountdown.value <= 0) clearInterruptPrompt();
    }, 1000);
  }, 180);
}

function sendInterrupt() {
  clearInterruptPrompt();
  emit('interrupt');
}

function clearInterruptPrompt() {
  interruptArmed.value = false;
  interruptModalVisible.value = false;
  interruptCountdown.value = 3;
  if (interruptShowTimer) clearTimeout(interruptShowTimer);
  if (interruptCountdownTimer) clearInterval(interruptCountdownTimer);
  interruptShowTimer = null;
  interruptCountdownTimer = null;
}

function moveCommandSelection(delta: number) {
  const count = commandResults.value.length;
  if (!count) {
    selectedCommandIndex.value = 0;
    return;
  }
  selectedCommandIndex.value = (selectedCommandIndex.value + delta + count) % count;
}

function acceptSelectedCommand(submitWhenComplete: boolean) {
  const entry = commandResults.value[selectedCommandIndex.value] ?? commandResults.value[0];
  if (!entry) return;
  acceptPaletteEntry(entry, submitWhenComplete);
}

function acceptPaletteEntry(entry: PaletteEntry, submitWhenComplete = false) {
  if (entry.kind === 'snippet') {
    if (submitWhenComplete) {
      emit('run-snippet', entry.snippet, entry.deliveryMode);
      commandPaletteDismissedFor.value = draft.value;
      return;
    }
    draft.value = entry.slash;
    commandPaletteDismissedFor.value = draft.value;
    selectedCommandIndex.value = 0;
    nextTick(() => inputRef.value?.focus());
    return;
  }
  acceptCommand(entry.command, submitWhenComplete);
}

function acceptCommand(command: AgentWebUiCommand, submitWhenComplete = false) {
  const token = draft.value.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  const noArgs = command.usage === command.slash;
  const exact = token === command.slash || command.aliases.includes(token as `/${string}`);
  if (submitWhenComplete && noArgs && exact) {
    emit('submit', 'default');
    return;
  }
  draft.value = noArgs ? command.slash : `${command.slash} `;
  commandPaletteDismissedFor.value = draft.value;
  selectedCommandIndex.value = 0;
  nextTick(() => inputRef.value?.focus());
}

function filterSnippetResults(query: string): OperatorSnippet[] {
  const normalized = query.trim().toLowerCase();
  const snippets = props.operatorSnippets ?? [];
  const [, ...terms] = draft.value.trim().split(/\s+/);
  const snippetCommand = normalized.startsWith('snip');
  const search = snippetCommand
    ? terms.join(' ').replace(/^(run|send|enqueue|search)\s+/i, '').trim().toLowerCase()
    : normalized;
  if (!snippetCommand && !search) return [];
  return snippets
    .filter((snippet) => !search || snippet.name.includes(search) || snippet.body.toLowerCase().includes(search))
    .sort(compareSnippets);
}

function compareSnippets(left: OperatorSnippet, right: OperatorSnippet): number {
  if (Boolean(left.pinned) !== Boolean(right.pinned)) return left.pinned ? -1 : 1;
  const leftUsed = left.last_used_at ?? '';
  const rightUsed = right.last_used_at ?? '';
  if (leftUsed !== rightUsed) return rightUsed.localeCompare(leftUsed);
  return left.name.localeCompare(right.name);
}
</script>

<template>
  <form id="operator-form" class="composer" aria-label="Operator input" @submit.prevent="emit('submit', 'default')">
    <div class="composer-input-stack">
      <div
        v-if="commandPaletteOpen"
        id="agent-web-ui-command-palette"
        class="command-palette"
        role="listbox"
        aria-label="Agent Web UI commands"
      >
        <button
          v-for="(entry, index) in commandResults"
          :id="`command-option-${entry.id}`"
          :key="entry.id"
          type="button"
          class="command-option"
          :class="{ 'command-option-active': index === selectedCommandIndex, 'command-option-danger': entry.danger, 'command-option-snippet': entry.kind === 'snippet' }"
          role="option"
          :aria-selected="index === selectedCommandIndex"
          @mouseenter="selectedCommandIndex = index"
          @click="acceptPaletteEntry(entry, false)"
        >
          <span class="command-option-main">
            <code>{{ entry.slash }}</code>
            <span v-if="entry.kind === 'snippet'" class="command-option-badge">Snippet</span>
            <strong>{{ entry.title }}</strong>
          </span>
          <span class="command-option-detail">{{ entry.description }}</span>
          <span class="command-option-meta">{{ entry.meta }}</span>
        </button>
        <p v-if="!commandResults.length" class="command-empty">No matching command</p>
      </div>
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
        aria-controls="agent-web-ui-command-palette"
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
