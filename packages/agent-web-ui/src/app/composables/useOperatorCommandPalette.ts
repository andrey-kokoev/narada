import { computed, nextTick, ref, watch, type ComputedRef, type Ref } from 'vue';
import {
  acceptOperatorCommandPaletteEntry,
  buildOperatorCommandPaletteEntries,
  buildOperatorCommandPaletteView,
  isImmediateOperatorCommandPaletteClick,
  isOperatorCommandPaletteOpen,
  type OperatorCommandPaletteEntry,
  type OperatorCommandPaletteView,
} from '../lib/operatorCommandController';
import type { OperatorSnippet, OperatorSnippetDeliveryMode } from './useOperatorSnippets';

export type { OperatorCommandPaletteEntry } from '../lib/operatorCommandController';

interface OperatorCommandPaletteOptions {
  draft: Ref<string>;
  disabled: ComputedRef<boolean>;
  operatorSnippets: ComputedRef<OperatorSnippet[]>;
  supportsProtocolMethod?: (method: string) => boolean;
  focusInput: () => void;
  submit: (deliveryMode?: OperatorSnippetDeliveryMode) => void;
  runSnippet: (snippet: OperatorSnippet, deliveryMode?: OperatorSnippetDeliveryMode) => void;
}

export function useOperatorCommandPalette(options: OperatorCommandPaletteOptions) {
  const commandPaletteDismissedFor = ref<string | null>(null);
  const selectedCommandIndex = ref(0);

  const commandPaletteOpen = computed(() => isOperatorCommandPaletteOpen(options.draft.value, commandPaletteDismissedFor.value, options.disabled.value));

  const commandResults = computed<OperatorCommandPaletteEntry[]>(() => {
    return buildOperatorCommandPaletteEntries({
      draft: options.draft.value,
      snippets: options.operatorSnippets.value,
      supportsProtocolMethod: options.supportsProtocolMethod,
    });
  });

  const commandPaletteView = computed<OperatorCommandPaletteView>(() => {
    return buildOperatorCommandPaletteView({ draft: options.draft.value, snippets: options.operatorSnippets.value });
  });

  const activeCommandOptionId = computed(() => {
    const entry = commandResults.value[selectedCommandIndex.value] ?? commandResults.value[0];
    return entry ? `command-option-${entry.id}` : undefined;
  });

  watch(commandResults, (commands, previousCommands) => {
    const commandIds = commands.map((entry) => entry.id).join('\n');
    const previousCommandIds = previousCommands?.map((entry) => entry.id).join('\n');
    if (!commands.length || selectedCommandIndex.value >= commands.length || commandIds !== previousCommandIds) selectedCommandIndex.value = 0;
  });

  function handlePaletteKeydown(event: KeyboardEvent): boolean {
    if (!commandPaletteOpen.value) return false;
    if (event.key === 'Escape') {
      event.preventDefault();
      commandPaletteDismissedFor.value = options.draft.value;
      return true;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveCommandSelection(event.key === 'ArrowDown' ? 1 : -1);
      return true;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      acceptSelectedCommand(false);
      return true;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      acceptSelectedCommand(true);
      return true;
    }
    return false;
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
    const entry = exactTypedCommandEntry() ?? commandResults.value[selectedCommandIndex.value] ?? commandResults.value[0];
    if (!entry) return;
    acceptPaletteEntry(entry, submitWhenComplete);
  }

  function exactTypedCommandEntry(): OperatorCommandPaletteEntry | undefined {
    const token = String(options.draft.value ?? '').trim().split(/\s+/)[0]?.toLowerCase();
    if (!token) return undefined;
    return commandResults.value.find((entry) => entry.kind === 'command' && (entry.command.slash === token || entry.command.aliases.includes(token as `/${string}`)));
  }

  function acceptPaletteEntry(entry: OperatorCommandPaletteEntry, submitWhenComplete = false) {
    const decision = acceptOperatorCommandPaletteEntry(entry, options.draft.value, submitWhenComplete);
    if (decision.kind === 'none') return;
    if (decision.kind === 'run-snippet' && decision.snippet) {
      options.runSnippet(decision.snippet, decision.deliveryMode);
      if (decision.dismissForDraft) commandPaletteDismissedFor.value = options.draft.value;
      return;
    }
    if (decision.draft !== undefined) options.draft.value = decision.draft;
    selectedCommandIndex.value = 0;
    if (decision.dismissForDraft) commandPaletteDismissedFor.value = options.draft.value;
    if (decision.kind === 'submit') {
      nextTick(() => options.submit(decision.deliveryMode ?? 'default'));
      return;
    }
    if (decision.deliveryMode && submitWhenComplete) nextTick(() => options.submit(decision.deliveryMode));
    else if (decision.focusInput) nextTick(options.focusInput);
  }

  function isImmediateClick(entry: OperatorCommandPaletteEntry): boolean {
    return isImmediateOperatorCommandPaletteClick(entry);
  }

  return {
    commandPaletteOpen,
    commandResults,
    commandPaletteView,
    selectedCommandIndex,
    activeCommandOptionId,
    acceptPaletteEntry,
    handlePaletteKeydown,
    isImmediateClick,
  };
}
