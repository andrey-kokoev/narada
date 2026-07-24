import test from 'node:test';
import assert from 'node:assert/strict';
import { OPERATOR_CONSOLE_PATH } from '@narada2/operator-console-contract';
import { OPERATOR_CONSOLE_OVERLAY_ID, createOperatorConsoleOverlayDocument, operatorConsoleUrl } from './index.mjs';

test('uses the stable Operator Router default without owning router lifecycle', () => {
  assert.equal(operatorConsoleUrl({
    env: { NARADA_OPERATOR_CONSOLE_URL: '', NARADA_OPERATOR_CONSOLE_HOST: '127.0.0.1', NARADA_OPERATOR_CONSOLE_PORT: '61729' },
  }), 'http://127.0.0.1:61729');
});

test('specializes only the document and keeps generic action semantics', () => {
  const document = createOperatorConsoleOverlayDocument({ url: 'http://127.0.0.1:61729', title: 'Console' });
  assert.equal(document.id, OPERATOR_CONSOLE_OVERLAY_ID);
  assert.equal(document.title_tone, 'accent');
  assert.equal(document.rows[1].value, OPERATOR_CONSOLE_PATH);
  assert.equal(document.rows[0].tone, 'default');
  assert.equal(document.rows[0].kind, 'open_url');
  assert.equal(document.rows[0].target, 'http://127.0.0.1:61729');
  assert.equal(document.rows[1].tone, 'default');
  assert.equal(document.rows[1].kind, 'open_url');
  assert.equal(document.rows[1].target, 'http://127.0.0.1:61729' + OPERATOR_CONSOLE_PATH);
  assert.equal(document.actions[0].label, 'Open console');
  assert.equal(document.actions[0].kind, 'open_url');
  assert.equal(document.actions[0].icon, '↗');
  assert.equal(document.actions[0].tone, 'accent');
  assert.equal(document.actions[0].target, 'http://127.0.0.1:61729');
  assert.equal(document.actions[1].id, 'restart-console');
  assert.equal(document.actions[1].kind, 'restart');
  assert.equal(document.actions[1].icon, '↻');
  assert.equal(document.actions[1].tooltip, 'Restart console');
});

test('does not expose local restart for a remote console URL', () => {
  const document = createOperatorConsoleOverlayDocument({ url: 'https://console.example.test' });
  assert.equal(document.actions.some((action) => action.kind === 'restart'), false);
});
