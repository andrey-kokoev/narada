#!/usr/bin/env node

import { main } from '../dist/main.js';

try {
  await main(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[narada-agent-pi-tui] ${message}\n`);
  process.exitCode = 1;
}
