#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAgentWebUiArgs, startAgentWebUiServer } from '../src/server.js';

function printHelp() {
  console.log(`narada-agent-web-ui --event-endpoint <ws-url> [--health-endpoint <http-url>] [--host 127.0.0.1] [--port 0]\n\nStarts a browser operator surface over one NARS session. The web UI subscribes to events, submits ordinary text as conversation.send, and projects slash commands into NARS protocol frames. Browser status polling uses the local HTTP /api/health proxy; /health slash input uses the NARS session.health protocol method.`);
}

async function main() {
  const options = parseAgentWebUiArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const result = await startAgentWebUiServer(options);
  console.log(`agent-web-ui: ${result.url}`);
  console.log(`  Events  ${options.eventEndpoint ?? 'not configured'}`);
  console.log(`  Health  ${options.healthEndpoint ?? 'not configured'} via local /api/health`);
  console.log('  Input   conversation.send + slash commands');
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
