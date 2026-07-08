import { AGENT_WEB_UI_SNIPPET_USAGE, parseAgentWebUiSnippetCommand } from '@narada2/nars-client-projection-contract';
import { computed, ref } from 'vue';

export interface OperatorSnippet {
  id: string;
  name: string;
  body: string;
  created_at: string;
  updated_at: string;
  pinned?: boolean;
  last_used_at?: string | null;
  use_count?: number;
}

export interface OperatorSnippetCommandEvent {
  event: 'agent_web_ui_message';
  message: string;
  ok: boolean;
  snippet_name?: string;
  previous_snippet_name?: string;
  snippet_count?: number;
  delivery_mode?: OperatorSnippetDeliveryMode;
}

export interface OperatorSnippetFeedback {
  id: number;
  event: OperatorSnippetCommandEvent;
}

export interface OperatorSnippetOpenRequest {
  id: number;
  query?: string;
  mode?: 'list' | 'create';
}

export type OperatorSnippetDeliveryMode = 'default' | 'enqueue';

const STORAGE_KEY = 'narada:agent-web-ui:operator-snippets.v1';

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeName(name: string): string {
  return String(name ?? '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function snippetIdForName(name: string): string {
  return `snippet-${normalizeName(name)}`;
}

function normalizeEntry(entry: Record<string, unknown>, timestamp = nowIso()): OperatorSnippet | null {
  const name = normalizeName(String(entry?.name ?? ''));
  const body = String(entry?.body ?? '').trim();
  if (!name || !body) return null;
  return {
    id: snippetIdForName(name),
    name,
    body,
    created_at: typeof entry?.created_at === 'string' ? entry.created_at : timestamp,
    updated_at: typeof entry?.updated_at === 'string' ? entry.updated_at : timestamp,
    pinned: entry?.pinned === true,
    last_used_at: typeof entry?.last_used_at === 'string' ? entry.last_used_at : null,
    use_count: Number.isFinite(entry?.use_count) ? Number(entry.use_count) : 0,
  };
}

function readStoredSnippets(): OperatorSnippet[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    const entries = parsed.map((entry) => normalizeEntry(entry)).filter((entry): entry is OperatorSnippet => Boolean(entry));
    return [...new Map(entries.map((entry) => [entry.name, entry])).values()];
  } catch {
    return [];
  }
}

function persistSnippets(snippets: OperatorSnippet[]): boolean {
  if (typeof window === 'undefined') return true;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snippets));
    return true;
  } catch {
    return false;
  }
}

function parseNameAndBody(value: string): { name: string; body: string } {
  const trimmed = String(value ?? '').trim();
  const match = /^(?:"([^"]+)"|'([^']+)'|(\S+))\s+([\s\S]+)$/.exec(trimmed);
  return { name: normalizeName(match?.[1] ?? match?.[2] ?? match?.[3] ?? ''), body: String(match?.[4] ?? '').trim() };
}

function parseName(value: string): string {
  const trimmed = String(value ?? '').trim();
  const match = /^(?:"([^"]+)"|'([^']+)'|(\S+))/.exec(trimmed);
  return normalizeName(match?.[1] ?? match?.[2] ?? match?.[3] ?? '');
}

function commandMessage(message: string, fields: Partial<OperatorSnippetCommandEvent> = {}): OperatorSnippetCommandEvent {
  return { event: 'agent_web_ui_message', ok: fields.ok ?? false, message, ...fields };
}

export function useOperatorSnippets() {
  const snippets = ref<OperatorSnippet[]>(readStoredSnippets());
  const sortedSnippets = computed(() => [...snippets.value].sort(compareSnippets));

  function saveSnippet(name: string, body: string, mode: 'save' | 'edit' = 'save') {
    const normalizedName = normalizeName(name);
    const text = String(body ?? '').trim();
    if (!normalizedName || !text) return commandMessage(`Usage: /snippet ${mode} <name> <text>`);
    const existing = snippets.value.find((entry) => entry.name === normalizedName) ?? null;
    if (mode === 'edit' && !existing) return commandMessage(`Snippet not found: ${normalizedName}`);
    const timestamp = nowIso();
    const next = existing
      ? snippets.value.map((entry) => entry.name === normalizedName ? { ...entry, body: text, updated_at: timestamp } : entry)
      : [...snippets.value, { id: snippetIdForName(normalizedName), name: normalizedName, body: text, created_at: timestamp, updated_at: timestamp, pinned: false, last_used_at: null, use_count: 0 }];
    if (!persistSnippets(next)) return commandMessage('Snippet storage is unavailable; snippet was not saved.');
    snippets.value = next;
    return commandMessage(`${existing ? 'Updated' : 'Saved'} snippet: ${normalizedName}`, { ok: true, snippet_name: normalizedName });
  }

  function restoreSnippet(snippet: OperatorSnippet) {
    const restored = normalizeEntry(snippet as unknown as Record<string, unknown>);
    if (!restored) return commandMessage('Deleted snippet could not be restored.');
    const existing = snippets.value.find((entry) => entry.name === restored.name) ?? null;
    if (existing) return commandMessage(`Snippet already exists: ${restored.name}`);
    const next = [...snippets.value, restored];
    if (!persistSnippets(next)) return commandMessage('Snippet storage is unavailable; snippet was not restored.');
    snippets.value = next;
    return commandMessage(`Restored snippet: ${restored.name}`, { ok: true, snippet_name: restored.name });
  }

  function deleteSnippet(name: string) {
    const normalizedName = normalizeName(name);
    if (!normalizedName) return commandMessage('Usage: /snippet delete <name>');
    const before = snippets.value.length;
    const next = snippets.value.filter((entry) => entry.name !== normalizedName);
    if (next.length === before) return commandMessage(`Snippet not found: ${normalizedName}`);
    if (!persistSnippets(next)) return commandMessage('Snippet storage is unavailable; snippet was not deleted.');
    snippets.value = next;
    return commandMessage(`Deleted snippet: ${normalizedName}`, { ok: true, snippet_name: normalizedName });
  }

  function renameSnippet(oldName: string, newName: string, body: string) {
    const normalizedOldName = normalizeName(oldName);
    const normalizedNewName = normalizeName(newName);
    const text = String(body ?? '').trim();
    if (!normalizedOldName || !normalizedNewName || !text) return commandMessage('Usage: rename requires old name, new name, and body');
    const existing = snippets.value.find((entry) => entry.name === normalizedOldName) ?? null;
    if (!existing) return commandMessage(`Snippet not found: ${normalizedOldName}`);
    const collision = snippets.value.find((entry) => entry.name === normalizedNewName && entry.name !== normalizedOldName) ?? null;
    if (collision) return commandMessage(`Snippet already exists: ${normalizedNewName}`);
    const timestamp = nowIso();
    const next = snippets.value.map((entry) => entry.name === normalizedOldName
      ? { ...entry, id: snippetIdForName(normalizedNewName), name: normalizedNewName, body: text, updated_at: timestamp }
      : entry);
    if (!persistSnippets(next)) return commandMessage('Snippet storage is unavailable; snippet was not renamed.');
    snippets.value = next;
    return commandMessage(`Renamed snippet: ${normalizedOldName} -> ${normalizedNewName}`, { ok: true, snippet_name: normalizedNewName, previous_snippet_name: normalizedOldName });
  }

  function togglePinned(name: string) {
    const normalizedName = normalizeName(name);
    const existing = snippets.value.find((entry) => entry.name === normalizedName) ?? null;
    if (!existing) return commandMessage(`Snippet not found: ${normalizedName || '<missing>'}`);
    const next = snippets.value.map((entry) => entry.name === normalizedName ? { ...entry, pinned: !entry.pinned, updated_at: nowIso() } : entry);
    if (!persistSnippets(next)) return commandMessage('Snippet storage is unavailable; pin state was not saved.');
    snippets.value = next;
    return commandMessage(`${existing.pinned ? 'Unpinned' : 'Pinned'} snippet: ${normalizedName}`, { ok: true, snippet_name: normalizedName });
  }

  function markSnippetUsed(name: string) {
    const normalizedName = normalizeName(name);
    const next = snippets.value.map((entry) => entry.name === normalizedName
      ? { ...entry, last_used_at: nowIso(), use_count: (entry.use_count ?? 0) + 1 }
      : entry);
    if (!persistSnippets(next)) return false;
    snippets.value = next;
    return true;
  }

  function importSnippetsJson(json: string) {
    try {
      const parsed = JSON.parse(String(json ?? ''));
      const entries: Record<string, unknown>[] = (Array.isArray(parsed) ? parsed : Array.isArray(parsed?.snippets) ? parsed.snippets : []) as Record<string, unknown>[];
      const timestamp = nowIso();
      const imported = entries
        .map((entry) => normalizeEntry(entry, timestamp))
        .filter((entry): entry is OperatorSnippet => Boolean(entry));
      if (!imported.length) return commandMessage('No valid snippets found in import JSON.');
      const merged = new Map(snippets.value.map((entry) => [entry.name, entry]));
      for (const entry of imported) {
        const existing = merged.get(entry.name) ?? null;
        merged.set(entry.name, existing ? {
          ...entry,
          created_at: existing.created_at,
          pinned: existing.pinned,
          last_used_at: existing.last_used_at,
          use_count: existing.use_count,
        } : entry);
      }
      const next = [...merged.values()];
      if (!persistSnippets(next)) return commandMessage('Snippet storage is unavailable; import was not saved.');
      snippets.value = next;
      return commandMessage(`Imported ${imported.length} snippet(s).`, { ok: true, snippet_count: imported.length });
    } catch (error) {
      return commandMessage(`Invalid snippet import JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function searchSnippets(query = '') {
    const normalizedQuery = String(query ?? '').trim().toLowerCase();
    const matches = sortedSnippets.value.filter((entry) => (
      !normalizedQuery || entry.name.includes(normalizedQuery) || entry.body.toLowerCase().includes(normalizedQuery)
    ));
    const summary = matches.length
      ? matches.map((entry) => `${entry.name}: ${entry.body.slice(0, 90)}`).join('\n')
      : 'No matching snippets.';
    return commandMessage(summary, { ok: true, snippet_count: matches.length });
  }

  function findSnippet(name: string): OperatorSnippet | null {
    const normalizedName = normalizeName(name);
    return snippets.value.find((entry) => entry.name === normalizedName) ?? null;
  }

  function handleSnippetCommand(value: string) {
    const parsedCommand = parseAgentWebUiSnippetCommand(value);
    const action = parsedCommand.action;
    const remainder = parsedCommand.remainder;
    if (action?.id === 'save' || action?.id === 'edit') {
      const parsed = parseNameAndBody(remainder);
      return { kind: 'local_event' as const, event: saveSnippet(parsed.name, parsed.body, action.id) };
    }
    if (action?.id === 'delete') return { kind: 'local_event' as const, event: deleteSnippet(parseName(remainder)) };
    if (action?.id === 'search') return { kind: 'local_event' as const, event: searchSnippets(remainder) };
    if (action?.mode === 'select') {
      const snippet = findSnippet(parseName(remainder));
      if (!snippet) return { kind: 'local_event' as const, event: commandMessage(`Snippet not found: ${parseName(remainder) || '<missing>'}`) };
      return { kind: 'run' as const, snippet, deliveryMode: action.deliveryMode === 'enqueue' ? 'enqueue' as const : 'default' as const };
    }
    return { kind: 'local_event' as const, event: commandMessage(`Usage: ${AGENT_WEB_UI_SNIPPET_USAGE}`) };
  }

  function commandEvent(message: string, fields: Partial<OperatorSnippetCommandEvent> = {}) {
    return commandMessage(message, { ok: true, ...fields });
  }

  function exportSnippetsJson(): string {
    return JSON.stringify({ schema: 'narada.agent_web_ui.operator_snippets.v1', snippets: sortedSnippets.value }, null, 2);
  }

  return { snippets: sortedSnippets, handleSnippetCommand, findSnippet, searchSnippets, saveSnippet, restoreSnippet, deleteSnippet, renameSnippet, togglePinned, markSnippetUsed, importSnippetsJson, exportSnippetsJson, commandEvent };
}

function compareSnippets(left: OperatorSnippet, right: OperatorSnippet): number {
  if (Boolean(left.pinned) !== Boolean(right.pinned)) return left.pinned ? -1 : 1;
  const leftUsed = left.last_used_at ?? '';
  const rightUsed = right.last_used_at ?? '';
  if (leftUsed !== rightUsed) return rightUsed.localeCompare(leftUsed);
  return left.name.localeCompare(right.name);
}
