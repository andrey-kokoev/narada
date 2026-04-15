#!/usr/bin/env node
/**
 * @deprecated This CLI is deprecated. Please use the exchange-fs-sync-cli package instead.
 * Install: npm install -g exchange-fs-sync-cli
 * Usage: exchange-sync <command>
 */
import { resolve } from "node:path";
import { stderr } from "node:process";
import { loadConfig } from "../config/load.js";
import { DefaultGraphAdapter } from "../adapter/graph/adapter.js";
import { ExchangeSource } from "../adapter/graph/exchange-source.js";
import { DefaultSyncRunner } from "../runner/sync-once.js";
import { FileCursorStore } from "../persistence/cursor.js";
import { FileApplyLogStore } from "../persistence/apply-log.js";
import { DefaultProjector } from "../projector/apply-event.js";
import { cleanupTmp } from "../recovery/cleanup-tmp.js";
import { FileLock } from "../persistence/lock.js";
import { ClientCredentialsTokenProvider } from "../adapter/graph/auth.js";
import { GraphHttpClient } from "../adapter/graph/client.js";
import { normalizeFolderRef, normalizeFlagged } from "../adapter/graph/scope.js";


function printDeprecationWarning(): void {
  stderr.write("\n");
  stderr.write("╔════════════════════════════════════════════════════════════════╗\n");
  stderr.write("║  DEPRECATION WARNING                                           ║\n");
  stderr.write("║                                                                ║\n");
  stderr.write("║  This CLI is deprecated and will be removed in a future        ║\n");
  stderr.write("║  version. Please use the exchange-fs-sync-cli package:         ║\n");
  stderr.write("║                                                                ║\n");
  stderr.write("║    npm install -g exchange-fs-sync-cli                         ║\n");
  stderr.write("║    exchange-sync <command>                                     ║\n");
  stderr.write("║                                                                ║\n");
  stderr.write("╚════════════════════════════════════════════════════════════════╝\n");
  stderr.write("\n");
}

async function main() {
  printDeprecationWarning();
  
  const configPath = process.argv[2] || "./config.json";
  
  console.log(`Loading config from: ${configPath}`);
  const config = await loadConfig({ path: configPath });
  
  const rootDir = resolve(config.root_dir);
  
  // Set up token provider for Graph API
  const tenantId = config.graph.tenant_id;
  const clientId = config.graph.client_id;
  const clientSecret = config.graph.client_secret;
  
  if (!tenantId || !clientId || !clientSecret) {
    console.error("Missing required Graph credentials: tenant_id, client_id, client_secret");
    process.exit(1);
  }
  
  const tokenProvider = new ClientCredentialsTokenProvider({
    tenantId,
    clientId,
    clientSecret,
    scope: "https://graph.microsoft.com/Mail.Read",
  });
  
  // Create Graph HTTP client
  const graphClient = new GraphHttpClient({
    tokenProvider,
    baseUrl: config.graph.base_url,
    preferImmutableIds: config.graph.prefer_immutable_ids,
  });
  
  // Create adapter
  const adapter = new DefaultGraphAdapter({
    mailbox_id: config.mailbox_id,
    user_id: config.graph.user_id,
    client: graphClient,
    adapter_scope: {
      mailbox_id: config.mailbox_id,
      ...config.scope,
    },
    body_policy: config.normalize.body_policy,
    attachment_policy: config.normalize.attachment_policy,
    include_headers: config.normalize.include_headers,
    normalize_folder_ref: normalizeFolderRef,
    normalize_flagged: normalizeFlagged,
  });
  
  // Create persistence stores
  const cursorStore = new FileCursorStore({
    rootDir,
    mailboxId: config.mailbox_id,
  });
  
  const applyLogStore = new FileApplyLogStore({ rootDir });
  

  
  const projector = new DefaultProjector({
    rootDir,
    tombstonesEnabled: config.normalize.tombstones_enabled,
  });
  
  // Create lock mechanism
  const lock = new FileLock({
    rootDir,
    acquireTimeoutMs: config.runtime.acquire_lock_timeout_ms,
  });
  
  const source = new ExchangeSource({ adapter, sourceId: config.mailbox_id });

  // Create sync runner
  const runner = new DefaultSyncRunner({
    rootDir,
    source,
    cursorStore,
    applyLogStore,
    projector,
    cleanupTmp: config.runtime.cleanup_tmp_on_startup
      ? () => cleanupTmp({ rootDir })
      : undefined,
    acquireLock: () => lock.acquire(),
    rebuildViewsAfterSync: config.runtime.rebuild_views_after_sync,
  });
  
  // Run sync
  console.log("Starting sync...");
  const result = await runner.syncOnce();
  
  console.log("\nSync complete:");
  console.log(`  Status: ${result.status}`);
  console.log(`  Events: ${result.event_count}`);
  console.log(`  Applied: ${result.applied_count}`);
  console.log(`  Skipped: ${result.skipped_count}`);
  console.log(`  Duration: ${result.duration_ms}ms`);
  
  if (result.error) {
    console.error(`  Error: ${result.error}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
