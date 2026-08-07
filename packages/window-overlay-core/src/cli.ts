#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { createOverlayDocument, inspectOverlay, normalizeOverlayVisibilityPolicy, requestOverlayFocus, requestOverlayRefresh, startOverlay, stopOverlay } from './index.js';

const args = process.argv.slice(2);
const command = args.shift() || 'status';
const valueOf = (name: string, fallback?: string): string | undefined => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const id = valueOf('--id', 'narada-overlay');
const stateRoot = valueOf('--state-root');
const emit = (value: unknown): void => { process.stdout.write(JSON.stringify(value, null, 2) + '\n'); };

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
    visibilityPolicy: normalizeOverlayVisibilityPolicy(valueOf('--visibility', 'terminal-group')),
    refreshSeconds: Number(valueOf('--refresh-seconds', '2') ?? '2'),
  }));
} else if (command === 'stop') {
  emit(await stopOverlay({ id, stateRoot }));
} else if (command === 'refresh') {
  emit(await requestOverlayRefresh(id ?? 'narada-overlay', { stateRoot }));
} else if (command === 'focus') {
  emit(await requestOverlayFocus(id ?? 'narada-overlay', { stateRoot }));
} else if (command === 'inspect' || command === 'status') {
  emit(await inspectOverlay({ id: id ?? 'narada-overlay', stateRoot }));
} else {
  throw new Error('overlay_command_unknown:' + command);
}
