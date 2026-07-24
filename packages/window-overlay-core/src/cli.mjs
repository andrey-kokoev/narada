#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { createOverlayDocument, inspectOverlay, requestOverlayRefresh, startOverlay, stopOverlay } from './index.mjs';

const args = process.argv.slice(2);
const command = args.shift() || 'status';
const valueOf = (name, fallback = undefined) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const id = valueOf('--id', 'narada-overlay');
const stateRoot = valueOf('--state-root');
const emit = (value) => process.stdout.write(JSON.stringify(value, null, 2) + '\n');

if (command === 'start') {
  const documentPath = valueOf('--document');
  const document = documentPath
    ? JSON.parse(await readFile(documentPath, 'utf8'))
    : createOverlayDocument({
      id,
      title: valueOf('--title', id),
      subtitle: valueOf('--subtitle'),
      rows: [],
      actions: valueOf('--url')
        ? [{ id: 'open', label: 'Open', kind: 'open_url', target: valueOf('--url') }]
        : [],
    });
  emit(await startOverlay({
    id,
    document,
    stateRoot,
    visibilityPolicy: valueOf('--visibility', 'windows-terminal'),
    refreshSeconds: Number(valueOf('--refresh-seconds', '2')),
  }));
} else if (command === 'stop') {
  emit(await stopOverlay({ id, stateRoot }));
} else if (command === 'refresh') {
  emit(await requestOverlayRefresh(id, { stateRoot }));
} else if (command === 'inspect' || command === 'status') {
  emit(await inspectOverlay({ id, stateRoot }));
} else {
  throw new Error('overlay_command_unknown:' + command);
}