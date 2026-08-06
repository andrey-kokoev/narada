/**
 * Litmus daemon entry point
 *
 * Boots the stock Narada sync service against a litmus sandbox:
 * - ingests <sandbox>/inbox.jsonl via LitmusInboxAdapter (instead of Graph)
 * - routes all Microsoft Graph HTTP through the litmus graph shim, which
 *   writes drafts.jsonl / outbox.jsonl with virtual-tick timestamps
 * - resolves `${ENV_VAR}` placeholders in the config (LITMUS_SANDBOX,
 *   LITMUS_STUB_URL, ...) so one checked-in template serves fresh sandboxes
 *
 * Usage:
 *   node dist/litmus/main.js -c <config-template.json> [--once] [-v]
 *
 * Environment:
 *   LITMUS_SANDBOX   sandbox directory (defaults to process.cwd())
 *   GRAPH_ACCESS_TOKEN  set to a static token if absent (no real Graph auth)
 */

import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSyncService } from "../service.js";
import type { LogFormat } from "../lib/logger.js";
import { LitmusInboxAdapter } from "./adapter.js";
import { createLitmusRulesFilter } from "./rules-filter.js";
import { installLitmusGraphShim } from "./graph-shim.js";

const require = createRequire(import.meta.url);

/**
 * Litmus crash-recovery helper.
 *
 * The harness kills the daemon with SIGKILL to simulate a crash. Any lease
 * that was active at that moment is dead, but its `expires_at` is written in
 * wall-clock time and may be minutes in the future. Without recovery the
 * restarted daemon sees a "principal runtime blocked" state and refuses to
 * dispatch follow-up work (e.g. the second turn in l1-multiturn-crash).
 *
 * This function force-expires active leases and abandons active execution
 * attempts before the service starts, so the stock scheduler stale-lease
 * recovery path in `createSyncService` can reset the principal and make the
 * work runnable again.
 */
function forceRecoverActiveLeases(coordinatorDbPath: string): void {
  type MinimalDb = {
    prepare: (sql: string) => { run: (...args: unknown[]) => unknown };
    close: () => void;
  };

  let db: MinimalDb | undefined;
  try {
    const { DatabaseSync } = require("node:sqlite") as {
      DatabaseSync: new (path: string) => MinimalDb;
    };
    db = new DatabaseSync(coordinatorDbPath);
    const nowIso = new Date().toISOString();
    db.prepare(`
      update work_item_leases
      set expires_at = ?
      where released_at is null and expires_at > ?
    `).run(nowIso, nowIso);
    db.prepare(`
      update execution_attempts
      set status = 'abandoned', completed_at = ?
      where status = 'active'
    `).run(nowIso);
  } catch {
    // First start, missing schema, or locked DB — nothing to recover.
  } finally {
    try {
      db?.close();
    } catch {
      // ignore close errors
    }
  }
}

function substituteEnv(text: string): string {
  return text.replace(/\$\{([A-Z0-9_]+)\}/g, (_match, name: string) => {
    const value = process.env[name];
    if (value === undefined) {
      throw new Error(`Config references unset environment variable: ${name}`);
    }
    // JSON literals (true/false/null/number) may be embedded unquoted in the
    // template; everything else is escaped for a JSON string literal.
    if (/^(true|false|null|-?\d+(\.\d+)?)$/.test(value)) {
      return value;
    }
    return JSON.stringify(value).slice(1, -1);
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  let configPath = "./litmus-config.json";
  let verbose = false;
  let logFormat: LogFormat | undefined;
  let once = false;
  let observationApiPort: number | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-c" || arg === "--config") {
      configPath = args[++i] ?? configPath;
    } else if (arg === "-v" || arg === "--verbose") {
      verbose = true;
    } else if (arg === "--log-format") {
      const raw = args[++i];
      if (raw !== "json" && raw !== "pretty" && raw !== "auto") {
        throw new Error(`Invalid --log-format: ${raw}. Valid: json, pretty, auto`);
      }
      logFormat = raw;
    } else if (arg === "--once") {
      once = true;
    } else if (arg === "--observation-port") {
      const raw = args[++i];
      observationApiPort = raw ? Number(raw) : undefined;
    } else if (arg === "-h" || arg === "--help") {
      console.log("Usage: narada-litmus [-c config.json] [-v] [--once] [--observation-port port]");
      process.exit(0);
    }
  }

  const sandboxDir = resolve(process.env.LITMUS_SANDBOX ?? process.cwd());
  process.env.LITMUS_SANDBOX = sandboxDir;

  // Static bearer token so the stock token provider never reaches for real
  // Graph auth; all Graph HTTP is intercepted by the shim anyway.
  process.env.GRAPH_ACCESS_TOKEN = process.env.GRAPH_ACCESS_TOKEN ?? "litmus-static-token";

  // Resolve config template against the environment and write it into the
  // sandbox so the run is self-contained and reproducible.
  const template = readFileSync(resolve(configPath), "utf8");
  const resolvedText = substituteEnv(template);
  mkdirSync(join(sandboxDir, "state"), { recursive: true });
  const resolvedConfigPath = join(sandboxDir, "state", "litmus-config.resolved.json");
  writeFileSync(resolvedConfigPath, resolvedText, "utf8");

  const resolved = JSON.parse(resolvedText) as {
    root_dir?: string;
    scopes?: Array<{
      scope_id?: string;
      root_dir?: string;
      scope?: { included_container_refs?: string[]; included_item_kinds?: string[] };
      normalize?: { body_policy?: "text_only" | "html_only" | "text_and_html"; attachment_policy?: "exclude" | "metadata_only" | "include_content" };
    }>;
  };
  const firstScope = resolved.scopes?.[0];
  const mailboxId = firstScope?.scope_id ?? "litmus-mailbox";
  const rootDir = firstScope?.root_dir ?? resolved.root_dir ?? join(sandboxDir, "narada-root");

  const rulesFilter = createLitmusRulesFilter({ sandboxDir });

  const adapter = new LitmusInboxAdapter({
    inboxPath: join(sandboxDir, "inbox.jsonl"),
    mailbox_id: mailboxId,
    filter: rulesFilter,
    adapter_scope: {
      mailbox_id: mailboxId,
      included_container_refs: firstScope?.scope?.included_container_refs ?? ["inbox"],
      included_item_kinds: firstScope?.scope?.included_item_kinds ?? ["message"],
    },
    body_policy: firstScope?.normalize?.body_policy ?? "text_only",
    attachment_policy: firstScope?.normalize?.attachment_policy ?? "metadata_only",
    include_headers: false,
    normalize_folder_ref: () => ["inbox"],
    normalize_flagged: (flag) => flag?.flagStatus === "flagged",
  });

  const coordinatorDbPath = join(rootDir, ".narada", "coordinator.db");

  installLitmusGraphShim({
    sandboxDir,
    coordinatorDbPath,
  });

  // Recover leases left behind by a SIGKILL crash so the restarted daemon
  // does not treat the old principal session as still executing.
  forceRecoverActiveLeases(coordinatorDbPath);

  console.log(`Using config: ${resolvedConfigPath}`);

  const service = await createSyncService({
    configPath: resolvedConfigPath,
    verbose,
    logFormat,
    adapter,
    observationApiPort,
  });

  let stopping = false;
  async function shutdown(signal: string): Promise<void> {
    if (stopping) return;
    stopping = true;
    console.log(`Received ${signal}, shutting down...`);
    try {
      await service.stop();
    } catch (error) {
      console.error("Error during shutdown:", error);
      process.exit(1);
    }
    process.exit(0);
  }

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  if (once) {
    const result = await service.runOnce();
    if (result !== "success") {
      process.exit(result === "retryable" ? 75 : 1);
    }
    return;
  }

  await service.start();
}

if (import.meta.url.startsWith("file:")) {
  const modulePath = fileURLToPath(import.meta.url);
  const invokedPath = process.argv[1];
  const isEntrypoint =
    invokedPath !== undefined &&
    realpathSync.native(invokedPath) === realpathSync.native(modulePath);
  if (isEntrypoint) {
    main().catch((error) => {
      console.error("Litmus daemon failed:", error);
      process.exit(1);
    });
  }
}
