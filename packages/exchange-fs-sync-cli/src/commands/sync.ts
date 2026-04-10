import { resolve } from "node:path";
import {
  loadConfig,
  buildGraphTokenProvider,
  GraphHttpClient,
  DefaultGraphAdapter,
  DefaultSyncRunner,
  FileCursorStore,
  FileApplyLogStore,
  DefaultProjector,
  cleanupTmp,
  FileLock,
  normalizeFolderRef,
  normalizeFlagged,
} from "exchange-fs-sync";

export interface SyncOptions {
  config: string;
  verbose?: boolean;
}

export async function syncCommand(options: SyncOptions): Promise<void> {
  const configPath = resolve(options.config);
  
  if (options.verbose) {
    console.error(`Loading config from: ${configPath}`);
  }
  
  const config = await loadConfig({ path: configPath });
  const rootDir = resolve(config.root_dir);
  
  // Set up token provider
  const tokenProvider = buildGraphTokenProvider({ config });
  
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
    normalize_folder_ref,
    normalize_flagged,
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
  
  // Create sync runner
  const runner = new DefaultSyncRunner({
    rootDir,
    adapter,
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
  if (options.verbose) {
    console.error("Starting sync...");
  }
  
  const result = await runner.syncOnce();
  
  // Output result as JSON for programmatic use
  console.log(JSON.stringify(result, null, 2));
  
  // Exit with error code on failure
  if (result.status === "fatal_failure") {
    process.exit(1);
  }
  if (result.status === "retryable_failure") {
    process.exit(2);
  }
}
