#!/usr/bin/env node
import { refreshOperatorConsoleOverlay, startOperatorConsoleOverlay, stopOperatorConsoleOverlay, inspectOperatorConsoleOverlay } from './index.mjs';

const args = process.argv.slice(2);
const command = args.shift() || 'inspect';
const valueOf = (name, fallback = undefined) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const options = {
  url: valueOf('--url'),
  title: valueOf('--title'),
  stateRoot: valueOf('--state-root'),
  visibilityPolicy: valueOf('--visibility', 'windows-terminal'),
  refreshSeconds: Number(valueOf('--refresh-seconds', '2')),
};
const result = command === 'start'
  ? await startOperatorConsoleOverlay(options)
  : command === 'stop'
    ? await stopOperatorConsoleOverlay(options)
    : command === 'refresh'
      ? await refreshOperatorConsoleOverlay(options)
      : await inspectOperatorConsoleOverlay(options);
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
