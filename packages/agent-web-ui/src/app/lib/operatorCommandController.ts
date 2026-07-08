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
import type { OperatorSnippet, OperatorSnippetDeliveryMode } from '../composables/useOperatorSnippets';

export type OperatorCommandPaletteEntry =
  | { kind: 'command'; command: AgentWebUiCommand; id: string; slash: string; title: string; description: string; meta: string; danger: boolean }
  | { kind: 'snippet-action'; action: AgentWebUiSnippetAction; id: string; slash: string; title: string; description: string; meta: string; danger: boolean; completion: string; immediate?: boolean }
  | { kind: 'snippet'; snippet: OperatorSnippet; deliveryMode: OperatorSnippetDeliveryMode; id: string; slash: string; title: string; description: string; meta: string; danger: false };

export interface OperatorCommandPaletteView {
  title: string;
  description: string;
  emptyText: string;
  hint: string;
  emptyHint: string;
}

export type OperatorCommandPaletteSection = 'commands' | 'actions' | 'snippets';

export const OPERATOR_COMMAND_PALETTE_SECTION_LABELS: Readonly<Record<OperatorCommandPaletteSection, string>> = Object.freeze({
  commands: 'Commands',
  actions: 'Actions',
  snippets: 'Saved snippets',
});

function snippetActionMeta(action: AgentWebUiSnippetAction): string {
  if (action.id === 'run') return 'select snippet / send now';
  if (action.id === 'enqueue') return 'select snippet / queue next';
  if (action.id === 'search') return 'open drawer / preserve query';
  if (action.id === 'save') return 'write name and body';
  if (action.id === 'edit') return 'write replacement body';
  if (action.id === 'delete') return 'choose snippet to delete';
  return action.meta;
}

export function buildOperatorCommandPaletteView(state: OperatorCommandControllerState): OperatorCommandPaletteView {
  if (!isSnippetPaletteActive(state.draft)) {
    return {
      title: 'Commands',
      description: 'Choose a command or run a matching snippet.',
      emptyText: 'No matching command',
      emptyHint: 'Try /help, /status, or a saved snippet name.',
      hint: 'Enter accepts. Tab completes. Esc closes.',
    };
  }
  const parsed = parseAgentWebUiSnippetCommand(snippetCommandValue(state.draft));
  if (isAgentWebUiSnippetSelectionAction(parsed.rawVerb)) {
    const action = findAgentWebUiSnippetAction(parsed.rawVerb);
    return {
      title: action?.id === 'enqueue' ? 'Snippet queue' : 'Snippet run',
      description: action?.id === 'enqueue' ? 'Choose a saved input to queue for the next turn.' : 'Choose a saved input to send now.',
      emptyText: state.snippets.length ? `No snippets match "${parsed.remainder}"` : 'No saved snippets yet. Use /snippet save to create one.',
      emptyHint: state.snippets.length ? 'Backspace to broaden the search, or open /snippets.' : 'Backspace to snippet actions, or type /snippet save.',
      hint: 'Enter runs the highlighted snippet. Tab fills the command.',
    };
  }
  return {
    title: 'Snippets',
    description: 'Choose what to do with browser-local saved inputs.',
    emptyText: 'No matching snippet action',
    emptyHint: 'Try run, enqueue, search, save, edit, or delete.',
    hint: 'Enter opens the selected action. Tab completes it.',
  };
}

export function operatorCommandPaletteEntrySection(entry: OperatorCommandPaletteEntry): OperatorCommandPaletteSection {
  if (entry.kind === 'snippet-action') return 'actions';
  if (entry.kind === 'snippet') return 'snippets';
  return 'commands';
}

export interface OperatorCommandControllerState {
  draft: string;
  snippets: readonly OperatorSnippet[];
}

export interface OperatorCommandAcceptDecision {
  kind: 'fill' | 'submit' | 'run-snippet' | 'none';
  draft?: string;
  deliveryMode?: OperatorSnippetDeliveryMode;
  snippet?: OperatorSnippet;
  dismissForDraft?: boolean;
  focusInput?: boolean;
}

export function isOperatorCommandPaletteOpen(draft: string, dismissedFor: string | null, disabled: boolean): boolean {
  return String(draft ?? '').startsWith('/') && draft !== dismissedFor && !disabled;
}

export function buildOperatorCommandPaletteEntries(state: OperatorCommandControllerState): OperatorCommandPaletteEntry[] {
  if (isSnippetPaletteActive(state.draft)) return buildSnippetPaletteEntries(state.draft, state.snippets);
  const query = commandQuery(state.draft).trim().toLowerCase();
  const commands: OperatorCommandPaletteEntry[] = filterAgentWebUiCommands(commandQuery(state.draft)).map((command) => ({
    kind: 'command',
    command,
    id: command.id,
    slash: command.slash,
    title: command.title,
    description: command.description,
    meta: command.group,
    danger: command.palette.danger,
  }));
  const directSnippets = query && !query.startsWith('snip') ? buildTopLevelSnippetResultEntries(query, state.snippets) : [];
  return [...commands, ...directSnippets].slice(0, 8);
}

export function acceptOperatorCommandPaletteEntry(entry: OperatorCommandPaletteEntry | null | undefined, draft: string, submitWhenComplete = false): OperatorCommandAcceptDecision {
  if (!entry) return { kind: 'none' };
  if (entry.kind === 'snippet-action') {
    const currentDraft = String(draft ?? '').trim();
    const normalizedCompletion = entry.completion.trim();
    if (entry.immediate && submitWhenComplete) {
      return { kind: 'submit', draft: immediateSnippetActionDraft(entry, draft), deliveryMode: 'default' };
    }
    if (submitWhenComplete && currentDraft === normalizedCompletion) return { kind: 'fill', draft: entry.completion, focusInput: true };
    return {
      kind: 'fill',
      draft: entry.completion,
      focusInput: !entry.immediate || !submitWhenComplete,
    };
  }
  if (entry.kind === 'snippet') {
    if (submitWhenComplete) return { kind: 'run-snippet', snippet: entry.snippet, deliveryMode: entry.deliveryMode };
    return { kind: 'fill', draft: entry.slash, dismissForDraft: true, focusInput: true };
  }
  return acceptCommandEntry(entry.command, draft, submitWhenComplete);
}

export function isImmediateOperatorCommandPaletteClick(entry: OperatorCommandPaletteEntry): boolean {
  return entry.kind === 'snippet'
    || (entry.kind === 'command' && entry.command.id === 'snippets')
    || (entry.kind === 'snippet-action' && entry.immediate === true);
}

function acceptCommandEntry(command: AgentWebUiCommand, draft: string, submitWhenComplete = false): OperatorCommandAcceptDecision {
  const trimmedDraft = String(draft ?? '').trim();
  const token = trimmedDraft.split(/\s+/)[0]?.toLowerCase() ?? '';
  const noArgs = command.usage === command.slash;
  const exact = token === command.slash || command.aliases.includes(token as `/${string}`);
  if (command.id === 'snippet') return { kind: 'fill', draft: '/snippet ', focusInput: true };
  if (command.id === 'snippets' && submitWhenComplete) {
    return { kind: 'submit', draft: trimmedDraft.toLowerCase().startsWith('/snippets') ? trimmedDraft : command.slash, deliveryMode: 'default' };
  }
  if (submitWhenComplete && noArgs && exact) return { kind: 'submit', deliveryMode: 'default' };
  return { kind: 'fill', draft: noArgs ? command.slash : `${command.slash} `, dismissForDraft: true, focusInput: true };
}

function commandQuery(draft: string): string {
  if (!String(draft ?? '').startsWith('/')) return '';
  return String(draft).slice(1).split(/\s+/)[0] ?? '';
}

function isSnippetPaletteActive(draft: string): boolean {
  const trimmed = String(draft ?? '').trim().toLowerCase();
  return /^\/snippet(?:\s|$)/.test(trimmed) && !trimmed.startsWith('/snippets');
}

function currentSnippetVerb(draft: string): OperatorSnippetDeliveryMode {
  return findAgentWebUiSnippetAction(currentSnippetAction(draft))?.deliveryMode === 'enqueue' ? 'enqueue' : 'default';
}

function currentSnippetAction(draft: string): string {
  const [, action = ''] = String(draft ?? '').trim().split(/\s+/);
  return action.toLowerCase();
}

function buildSnippetPaletteEntries(draft: string, snippets: readonly OperatorSnippet[]): OperatorCommandPaletteEntry[] {
  const parsed = parseAgentWebUiSnippetCommand(snippetCommandValue(draft));
  const actionEntries = filterAgentWebUiSnippetActions(parsed.rawVerb).map(snippetActionEntry);
  const snippetEntries = buildSnippetResultEntries(draft, snippets);
  if (isAgentWebUiSnippetSelectionAction(parsed.rawVerb) || (parsed.rawVerb && !parsed.recognized && !actionEntries.length)) return snippetEntries.slice(0, 8);
  return [...actionEntries, ...snippetEntries].slice(0, 8);
}

function snippetActionEntry(action: AgentWebUiSnippetAction): OperatorCommandPaletteEntry {
  return {
    kind: 'snippet-action',
    action,
    id: `snippet-action-${action.id}`,
    slash: action.slash,
    title: action.title,
    description: action.description,
    meta: snippetActionMeta(action),
    danger: action.id === 'delete',
    completion: action.completion,
    immediate: action.immediate,
  };
}

function immediateSnippetActionDraft(entry: Extract<OperatorCommandPaletteEntry, { kind: 'snippet-action' }>, draft: string): string {
  const completion = entry.completion.trim();
  if (entry.action.id !== 'search') return completion;
  const parsed = parseAgentWebUiSnippetCommand(snippetCommandValue(draft));
  return [completion, parsed.remainder].filter(Boolean).join(' ');
}

function buildSnippetResultEntries(draft: string, snippets: readonly OperatorSnippet[]): OperatorCommandPaletteEntry[] {
  const deliveryMode = currentSnippetVerb(draft);
  const snippetVerb = deliveryMode === 'enqueue' ? 'enqueue' : 'run';
  return filterSnippetResults(draft, snippets).map((snippet) => ({
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

function buildTopLevelSnippetResultEntries(query: string, snippets: readonly OperatorSnippet[]): OperatorCommandPaletteEntry[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [];
  return snippets
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

function filterSnippetResults(draft: string, snippets: readonly OperatorSnippet[]): OperatorSnippet[] {
  const search = snippetResultSearch(draft);
  const action = currentSnippetAction(draft);
  if (action && isAgentWebUiSnippetManagementAction(action)) return [];
  return [...snippets]
    .filter((snippet) => !search || snippet.name.includes(search) || snippet.body.toLowerCase().includes(search))
    .sort(compareSnippets);
}

function snippetResultSearch(draft: string): string {
  const parsed = parseAgentWebUiSnippetCommand(snippetCommandValue(draft));
  if (!parsed.rawVerb || isAgentWebUiSnippetManagementAction(parsed.rawVerb)) return '';
  if (isAgentWebUiSnippetSelectionAction(parsed.rawVerb)) return parsed.remainder.toLowerCase();
  return [parsed.rawVerb, parsed.remainder].join(' ').trim().toLowerCase();
}

function snippetCommandValue(draft: string): string {
  return String(draft ?? '').trim().replace(/^\/snippet\b/i, '').trim();
}

function compareSnippets(left: OperatorSnippet, right: OperatorSnippet): number {
  if (Boolean(left.pinned) !== Boolean(right.pinned)) return left.pinned ? -1 : 1;
  const leftUsed = left.last_used_at ?? '';
  const rightUsed = right.last_used_at ?? '';
  if (leftUsed !== rightUsed) return rightUsed.localeCompare(leftUsed);
  return left.name.localeCompare(right.name);
}
