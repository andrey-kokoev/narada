import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampTerminalColumns,
  clearPreviousTerminalRows,
  formatTimestamp,
  padVisible,
  stripAnsi,
  visibleLength,
  wrapIndentedLines,
  wrapTerminalLine,
} from './terminal-text.mjs';

test('terminal text primitives handle ANSI-aware width', () => {
  assert.equal(stripAnsi('\x1b[1mbold\x1b[0m'), 'bold');
  assert.equal(visibleLength('\x1b[1mbold\x1b[0m'), 4);
  assert.equal(padVisible('\x1b[1mbold\x1b[0m', 6), '\x1b[1mbold\x1b[0m  ');
});

test('terminal text wrapping is shared and deterministic', () => {
  assert.deepEqual(wrapTerminalLine('alpha beta gamma', 10), ['alpha beta', 'gamma']);
  assert.deepEqual(wrapIndentedLines('alpha beta gamma', { indent: '  ', columns: 12 }), ['  alpha beta', '  gamma']);
  assert.equal(clampTerminalColumns(200), 120);
  assert.equal(clampTerminalColumns('bad'), 88);
  assert.equal(clearPreviousTerminalRows(1), '\x1b[1A\r\x1b[K');
  assert.equal(formatTimestamp('2026-06-25T13:25:30.000Z'), '2026-06-25T13:25:30');
});
