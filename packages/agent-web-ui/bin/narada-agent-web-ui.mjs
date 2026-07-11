#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAgentWebUiArgs, startAgentWebUiServer } from '../src/server.js';

function printHelp() {
  console.log(`narada-agent-web-ui --event-endpoint <ws-url> [--health-endpoint <http-url>] [--host 127.0.0.1] [--port 0]\n\nCloudflare projection mode: narada-agent-web-ui --cloudflare-projection-id <id> --cloudflare-api-base-url <url>\nCloudflare authority mode: narada-agent-web-ui --cloudflare-authority-session-id <id> --cloudflare-api-base-url <url>\n\nStarts a browser operator surface over one NARS session. The web UI submits ordinary text with session.submit, queues active-turn text with delivery_mode=admit_after_active_turn, and uses session.cancel/session.close for slash controls. Cloudflare adapters translate these frames to their remote wire vocabulary. Browser status polling uses the local HTTP /api/health proxy or the Cloudflare projection/authority health endpoint.`);
}

async function main() {
  const options = parseAgentWebUiArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const result = await startAgentWebUiServer(options);
  const cloudflareAuthorityBase = options.cloudflareAuthoritySessionId ? `${options.cloudflareApiBaseUrl}/api/nars/authority/sessions/${options.cloudflareAuthoritySessionId}` : null;
  const cloudflareProjectionBase = options.cloudflareProjectionId ? `${options.cloudflareApiBaseUrl}/api/nars/projections/${options.cloudflareProjectionId}` : null;
  console.log(`agent-web-ui: ${result.url}`);
  console.log(`  Events  ${cloudflareAuthorityBase ? `${cloudflareAuthorityBase}/events/websocket` : cloudflareProjectionBase ? `${cloudflareProjectionBase}/events` : options.eventEndpoint ?? 'not configured'}`);
  console.log(`  Health  ${cloudflareAuthorityBase ? `${cloudflareAuthorityBase}/health` : cloudflareProjectionBase ? `${cloudflareProjectionBase}/health` : `${options.healthEndpoint ?? 'not configured'} via local /api/health`}`);
  console.log('  Input   session.submit/session.cancel/session.close; Cloudflare adapters translate as needed');
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
