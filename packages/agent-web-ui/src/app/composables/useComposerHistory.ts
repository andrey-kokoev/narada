export const DEFAULT_COMPOSER_HISTORY_LIMIT = 100;

export type ComposerHistoryNavigation = 'older' | 'newer';

export interface ComposerHistoryNavigationResult {
  handled: boolean;
  draft?: string;
}

export interface ComposerHistoryController {
  entries(): readonly string[];
  leaveNavigation(): void;
  navigate(direction: ComposerHistoryNavigation, currentDraft: string): ComposerHistoryNavigationResult;
  recordSubmission(content: string): boolean;
}

export function isCaretOnFirstLine(value: string, caretPosition: number): boolean {
  return value.lastIndexOf('\n', Math.max(-1, caretPosition - 1)) === -1;
}

export function isCaretOnLastLine(value: string, caretPosition: number): boolean {
  return value.indexOf('\n', Math.max(0, caretPosition)) === -1;
}

export function createComposerHistory(limit = DEFAULT_COMPOSER_HISTORY_LIMIT): ComposerHistoryController {
  const boundedLimit = Math.max(1, Math.floor(limit));
  let history: string[] = [];
  let historyIndex: number | null = null;
  let scratchDraft = '';

  function leaveNavigation() {
    historyIndex = null;
    scratchDraft = '';
  }

  function recordSubmission(content: string): boolean {
    const normalized = content.trim();
    if (!normalized || history.at(-1) === normalized) return false;
    history = [...history, normalized].slice(-boundedLimit);
    leaveNavigation();
    return true;
  }

  function navigate(direction: ComposerHistoryNavigation, currentDraft: string): ComposerHistoryNavigationResult {
    if (history.length === 0) return { handled: false };

    if (direction === 'older') {
      if (historyIndex === null) {
        scratchDraft = currentDraft;
        historyIndex = history.length;
      }
      historyIndex = Math.max(0, historyIndex - 1);
      return { handled: true, draft: history[historyIndex] ?? '' };
    }

    if (historyIndex === null) return { handled: false };
    if (historyIndex < history.length - 1) {
      historyIndex += 1;
      return { handled: true, draft: history[historyIndex] ?? '' };
    }

    const restoredDraft = scratchDraft;
    leaveNavigation();
    return { handled: true, draft: restoredDraft };
  }

  return {
    entries: () => [...history],
    leaveNavigation,
    navigate,
    recordSubmission,
  };
}

export function useComposerHistory(limit = DEFAULT_COMPOSER_HISTORY_LIMIT): ComposerHistoryController {
  return createComposerHistory(limit);
}
