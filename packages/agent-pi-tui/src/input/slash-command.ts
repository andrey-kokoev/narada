export { classifyOperatorInput } from './operator-input.js';
export type { LocalInputAction, OperatorInputClassification, OperatorInputKind } from './operator-input.js';

export interface SlashCompletionItem {
  value: string;
  label: string;
  description?: string;
}

export interface SlashAutocompleteProvider {
  triggerCharacters: string[];
  getSuggestions(lines: string[], cursorLine: number, cursorCol: number, options: { signal: AbortSignal; force?: boolean }): Promise<{ items: SlashCompletionItem[]; prefix: string } | null>;
  applyCompletion(lines: string[], cursorLine: number, cursorCol: number, item: SlashCompletionItem, prefix: string): { lines: string[]; cursorLine: number; cursorCol: number };
}

const COMPLETIONS: readonly SlashCompletionItem[] = [
  '/help', '/clear', '/view', '/latest', '/theme',
  '/status', '/health', '/events', '/recovery', '/interrupt', '/exit',
  '/model', '/provider', '/thinking',
].map((value) => ({ value, label: value }));

export function createSlashAutocompleteProvider(): SlashAutocompleteProvider {
  return {
    triggerCharacters: ['/'],
    async getSuggestions(lines, cursorLine, cursorCol) {
      const line = lines[cursorLine] ?? '';
      const beforeCursor = line.slice(0, cursorCol);
      const match = beforeCursor.match(/(?:^|\s)(\/[^\s]*)$/);
      if (!match) return null;
      const prefix = match[1] ?? '/';
      const items = COMPLETIONS.filter((item) => item.value.startsWith(prefix));
      return { items, prefix };
    },
    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      const nextLines = [...lines];
      const line = nextLines[cursorLine] ?? '';
      const start = Math.max(0, cursorCol - prefix.length);
      nextLines[cursorLine] = `${line.slice(0, start)}${item.value}${line.slice(cursorCol)}`;
      return { lines: nextLines, cursorLine, cursorCol: start + item.value.length };
    },
  };
}
