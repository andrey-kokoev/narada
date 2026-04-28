#!/usr/bin/env node
import { runMcpServer } from './mcp-server.js';

runMcpServer().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
