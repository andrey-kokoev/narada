import {
  filterAgentWebUiCommands,
  filterAgentWebUiSnippetActions,
  findAgentWebUiSnippetAction,
  isAgentWebUiSnippetManagementAction,
  isAgentWebUiSnippetSelectionAction,
  parseAgentWebUiSnippetCommand,
  type AgentWebUiCommand,
  type AgentWebUiSnippetAction,
} from '@narada2/nars-client-projection-contract';
import { computed, nextTick, ref, watch, type ComputedRef, type Ref } from 'vue';
import type { OperatorSnippet, OperatorSnippetDeliveryMode } from './useOperatorSnippets';

export type OperatorCommandPaletteEntry =
  | { kind: 'command'; command: AgentWebUiCommand; id: string; slash: string; title: string; description: string; meta: string; danger: boolean }
  | { kind: 'snippet-action'; action: AgentWebUiSnippetAction; id: string; slash: string; title: string; description: string; meta: string; danger: false; completion: string; immediate?: boolean }
  | { kind: 'snippet'; snippet: OperatorSnippet; deliveryMode: OperatorSnippetDeliveryMode; id: string; slash: string; title: string; description: string; meta: string; danger: false };

interface OperatorCommandPaletteOptions {
  draft: Ref<string>;
  disabled: ComputedRef<boolean>;
  operatorSnippets: ComputedRef<OperatorSnippet[]>;
  focusInput: () => void;
  submit: (deliveryMode?: OperatorSnippetDeliveryMode) => void;
  runSnippet: (snippet: OperatorSnippet, deliveryMode?: OperatorSnippetDeliveryMode) => void;
}

export function useOperatorCommandPalette(options: OperatorCommandPaletteOptions) {
  const commandPaletteDismissedFor = ref<string | null>(null);
  const selectedCommandIndex = ref(0);

  const commandQuery = computed(() => {
    if (!options.draft.value.startsWith('/')) return '';
    return options.draft.value.slice(1).split(/\s+/)[0] ?? '';
  });

  const commandPaletteOpen = computed(() => (
    options.draft.value.startsWith('/')
    && options.draft.value !== commandPaletteDismissedFor.value
    && !options.disabled.value
  ));

  const commandResults = computed<OperatorCommandPaletteEntry[]>(() => {
    if (isSnippetPaletteActive()) return buildSnippetPaletteEntries();
    const query = commandQuery.value.trim().toLowerCase();
    const commands: OperatorCommandPaletteEntry[] = filterAgentWebUiCommands(commandQuery.value).map((command) => ({
      kind: 'command',
      command,
      id: command.id,
      slash: command.slash,
      title: command.title,
      description: command.description,
      meta: command.group,
      danger: command.palette.danger,
    }));
    const directSnippets = query && !query.startsWith('snip') ? buildTopLevelSnippetResultEntries(query) : [];
    return [...commands, ...directSnippets].slice(0, 8);
  });

  const activeCommandOptionId = computed(() => {
    const entry = commandResults.value[selectedCommandIndex.value] ?? commandResults.value[0];
    return entry ? `command-option-${entry.id}` : undefined;
  });

  watch(commandResults, (commands) => {
    if (!commands.length || selectedCommandIndex.value >= commands.length) selectedCommandIndex.value = 0;
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
    const entry = commandResults.value[selectedCommandIndex.value] ?? commandResults.value[0];
    if (!entry) return;
    acceptPaletteEntry(entry, submitWhenComplete);
  }

  function acceptPaletteEntry(entry: OperatorCommandPaletteEntry, submitWhenComplete = false) {
    if (entry.kind === 'snippet-action') {
      options.draft.value = entry.completion;
      selectedCommandIndex.value = 0;
      if (entry.immediate && submitWhenComplete) nextTick(() => options.submit('default'));
      else nextTick(options.focusInput);
      return;
    }
    if (entry.kind === 'snippet') {
      if (submitWhenComplete) {
        options.runSnippet(entry.snippet, entry.deliveryMode);
        commandPaletteDismissedFor.value = options.draft.value;
        return;
      }
      options.draft.value = entry.slash;
      commandPaletteDismissedFor.value = options.draft.value;
      selectedCommandIndex.value = 0;
      nextTick(options.focusInput);
      return;
    }
    acceptCommand(entry.command, submitWhenComplete);
  }

  function acceptCommand(command: AgentWebUiCommand, submitWhenComplete = false) {
    const trimmedDraft = options.draft.value.trim();
    const token = trimmedDraft.split(/\s+/)[0]?.toLowerCase() ?? '';
    const noArgs = command.usage === command.slash;
    const exact = token === command.slash || command.aliases.includes(token as `/${string}`);
    if (command.id === 'snippet') {
      options.draft.value = '/snippet ';
      selectedCommandIndex.value = 0;
      nextTick(options.focusInput);
      return;
    }
    if (command.id === 'snippets' && submitWhenComplete) {
      options.draft.value = trimmedDraft.toLowerCase().startsWith('/snippets') ? trimmedDraft : command.slash;
      nextTick(() => options.submit('default'));
      return;
    }
    if (submitWhenComplete && noArgs && exact) {
      options.submit('default');
      return;
    }
    options.draft.value = noArgs ? command.slash : `${command.slash} `;
    commandPaletteDismissedFor.value = options.draft.value;
    selectedCommandIndex.value = 0;
    nextTick(options.focusInput);
  }

  function isImmediateClick(entry: OperatorCommandPaletteEntry): boolean {
    return (entry.kind === 'command' && entry.command.id === 'snippets') || (entry.kind === 'snippet-action' && entry.immediate === true);
  }

  function isSnippetPaletteActive(): boolean {
    const trimmed = options.draft.value.trim().toLowerCase();
    return /^\/snippet(?:\s|$)/.test(trimmed) && !trimmed.startsWith('/snippets');
  }

  function currentSnippetVerb(): OperatorSnippetDeliveryMode {
    return findAgentWebUiSnippetAction(currentSnippetAction())?.deliveryMode === 'enqueue' ? 'enqueue' : 'default';
  }

  function currentSnippetAction(): string {
    const [, action = ''] = options.draft.value.trim().split(/\s+/);
    return action.toLowerCase();
  }

  function buildSnippetPaletteEntries(): OperatorCommandPaletteEntry[] {
    const parsed = parseAgentWebUiSnippetCommand(snippetCommandValue());
    const actionEntries = filterAgentWebUiSnippetActions(parsed.rawVerb).map(snippetActionEntry);
    const snippets = buildSnippetResultEntries();
    if (isAgentWebUiSnippetSelectionAction(parsed.rawVerb) || (parsed.rawVerb && !parsed.recognized && !actionEntries.length)) return snippets.slice(0, 8);
    return [...actionEntries, ...snippets].slice(0, 8);
  }

  function snippetActionEntry(action: AgentWebUiSnippetAction): OperatorCommandPaletteEntry {
    return {
      kind: 'snippet-action',
      action,
      id: `snippet-action-${action.id}`,
      slash: action.slash,
      title: action.title,
      description: action.description,
      meta: action.meta,
      danger: false,
      completion: action.completion,
      immediate: action.immediate,
    };
  }

  function buildSnippetResultEntries(): OperatorCommandPaletteEntry[] {
    const deliveryMode = currentSnippetVerb();
    const snippetVerb = deliveryMode === 'enqueue' ? 'enqueue' : 'run';
    return filterSnippetResults().map((snippet) => ({
      kind: 'snippet' as const,
      snippet,
      deliveryMode,
      id: `snippet-${snippetVerb}-${snippet.id}`,
      slash: `/snippet ${snippetVerb} ${snippet.name}`,
      title: snippet.name,
      description: snippet.body.slice(0, 120),
      meta: [snippet.pinned ? 'pinned' : 'snippet', deliveryMode === 'enqueue' ? 'queue' : 'run', snippet.last_used_at ? `used ${snippet.use_count ?? 0}` : null].filter(Boolean).join(' / '),
      danger: false as const,
    }));
  }

  function buildTopLevelSnippetResultEntries(query: string): OperatorCommandPaletteEntry[] {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];
    return options.operatorSnippets.value
      .filter((snippet) => snippet.name.includes(normalizedQuery) || snippet.body.toLowerCase().includes(normalizedQuery))
      .sort(compareSnippets)
      .map((snippet) => ({
        kind: 'snippet' as const,
        snippet,
        deliveryMode: 'default' as const,
        id: `snippet-direct-${snippet.id}`,
        slash: `/snippet run ${snippet.name}`,
        title: snippet.name,
        description: snippet.body.slice(0, 120),
        meta: [snippet.pinned ? 'pinned' : 'snippet', 'run', snippet.last_used_at ? `used ${snippet.use_count ?? 0}` : null].filter(Boolean).join(' / '),
        danger: false as const,
      }));
  }

  function filterSnippetResults(): OperatorSnippet[] {
    const search = snippetResultSearch();
    const action = currentSnippetAction();
    if (action && isAgentWebUiSnippetManagementAction(action)) return [];
    return options.operatorSnippets.value
      .filter((snippet) => !search || snippet.name.includes(search) || snippet.body.toLowerCase().includes(search))
      .sort(compareSnippets);
  }

  function snippetResultSearch(): string {
    const parsed = parseAgentWebUiSnippetCommand(snippetCommandValue());
    if (!parsed.rawVerb || isAgentWebUiSnippetManagementAction(parsed.rawVerb)) return '';
    if (isAgentWebUiSnippetSelectionAction(parsed.rawVerb)) return parsed.remainder.toLowerCase();
    return [parsed.rawVerb, parsed.remainder].join(' ').trim().toLowerCase();
  }

  function snippetCommandValue(): string {
    return options.draft.value.trim().replace(/^\/snippet\b/i, '').trim();
  }

  return {
    commandPaletteOpen,
    commandResults,
    selectedCommandIndex,
    activeCommandOptionId,
    acceptPaletteEntry,
    handlePaletteKeydown,
    isImmediateClick,
  };
}

function compareSnippets(left: OperatorSnippet, right: OperatorSnippet): number {
  if (Boolean(left.pinned) !== Boolean(right.pinned)) return left.pinned ? -1 : 1;
  const leftUsed = left.last_used_at ?? '';
  const rightUsed = right.last_used_at ?? '';
  if (leftUsed !== rightUsed) return rightUsed.localeCompare(leftUsed);
  return left.name.localeCompare(right.name);
}
