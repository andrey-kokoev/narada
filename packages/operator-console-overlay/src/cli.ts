#!/usr/bin/env node

type AnyRecord = Record<string, any>;
import { focusOperatorConsoleOverlay, refreshOperatorConsoleOverlay, startOperatorConsoleOverlay, stopOperatorConsoleOverlay, inspectOperatorConsoleOverlay } from './index.js';

const args = process.argv.slice(2);
const command = args.shift() || 'inspect';
const valueOf = (name: string, fallback: string | undefined = undefined): string | undefined => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const options: AnyRecord = {
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
      : command === 'focus'
        ? await focusOperatorConsoleOverlay(options)
      : await inspectOperatorConsoleOverlay(options);
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
