import test from 'node:test';
import assert from 'node:assert/strict';
import { isAgentMenuKeyboardOpen, isAgentMenuNavigationKey, nextAgentMenuItemIndex } from '../src/site-agents/menu.ts';

test('menu navigation keys are recognized', () => {
  for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) assert.equal(isAgentMenuNavigationKey(key), true, key);
  for (const key of ['Escape', 'Enter', 'Tab', ' ']) assert.equal(isAgentMenuNavigationKey(key), false, key);
});

test('arrow navigation cycles enabled items and wraps at the edges', () => {
  assert.equal(nextAgentMenuItemIndex(2, 0, 'ArrowDown'), 1);
  assert.equal(nextAgentMenuItemIndex(2, 1, 'ArrowDown'), 0);
  assert.equal(nextAgentMenuItemIndex(2, 0, 'ArrowUp'), 1);
  assert.equal(nextAgentMenuItemIndex(2, 1, 'ArrowUp'), 0);
  assert.equal(nextAgentMenuItemIndex(0, 0, 'ArrowDown'), -1);
  assert.equal(nextAgentMenuItemIndex(3, -1, 'ArrowDown'), 0, 'no active item starts at the first');
  assert.equal(nextAgentMenuItemIndex(3, -1, 'ArrowUp'), 2, 'no active item wraps to the last');
});

test('Home and End jump to the first and last enabled items', () => {
  assert.equal(nextAgentMenuItemIndex(3, 1, 'Home'), 0);
  assert.equal(nextAgentMenuItemIndex(3, 1, 'End'), 2);
  assert.equal(nextAgentMenuItemIndex(3, -1, 'End'), 2);
});

test('ContextMenu key and Shift+F10 open the menu; other keys do not', () => {
  assert.equal(isAgentMenuKeyboardOpen({ key: 'ContextMenu', shiftKey: false }), true);
  assert.equal(isAgentMenuKeyboardOpen({ key: 'F10', shiftKey: true }), true);
  assert.equal(isAgentMenuKeyboardOpen({ key: 'F10', shiftKey: false }), false);
  assert.equal(isAgentMenuKeyboardOpen({ key: 'Enter', shiftKey: false }), false);
});
