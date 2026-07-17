import { describe, expect, it } from 'vitest';
import { createComposerHistory, isCaretOnFirstLine, isCaretOnLastLine } from '../src/app/composables/useComposerHistory';

describe('composer history', () => {
  it('only admits entries when the successful-submit path records them', () => {
    const history = createComposerHistory();

    expect(history.entries()).toEqual([]);
    expect(history.navigate('older', 'unsent draft').handled).toBe(false);

    expect(history.recordSubmission(' accepted message ')).toBe(true);
    expect(history.entries()).toEqual(['accepted message']);
  });

  it('suppresses empty and consecutive duplicate submissions', () => {
    const history = createComposerHistory();

    expect(history.recordSubmission('   ')).toBe(false);
    expect(history.recordSubmission('same')).toBe(true);
    expect(history.recordSubmission(' same ')).toBe(false);
    expect(history.entries()).toEqual(['same']);
  });

  it('restores the scratch draft after navigating older and newer entries', () => {
    const history = createComposerHistory();
    history.recordSubmission('A');
    history.recordSubmission('B');

    expect(history.navigate('older', 'scratch')).toEqual({ handled: true, draft: 'B' });
    expect(history.navigate('older', 'B')).toEqual({ handled: true, draft: 'A' });
    expect(history.navigate('newer', 'A')).toEqual({ handled: true, draft: 'B' });
    expect(history.navigate('newer', 'B')).toEqual({ handled: true, draft: 'scratch' });
    expect(history.navigate('newer', 'scratch').handled).toBe(false);
  });

  it('keeps only the bounded latest entries', () => {
    const history = createComposerHistory(2);
    history.recordSubmission('A');
    history.recordSubmission('B');
    history.recordSubmission('C');

    expect(history.entries()).toEqual(['B', 'C']);
  });

  it('identifies first and last line caret positions for arrow gating', () => {
    const value = 'first line\nlast line';

    expect(isCaretOnFirstLine(value, 0)).toBe(true);
    expect(isCaretOnFirstLine(value, 5)).toBe(true);
    expect(isCaretOnFirstLine(value, 11)).toBe(false);
    expect(isCaretOnLastLine(value, 5)).toBe(false);
    expect(isCaretOnLastLine(value, 11)).toBe(true);
    expect(isCaretOnLastLine(value, value.length)).toBe(true);
  });
});
