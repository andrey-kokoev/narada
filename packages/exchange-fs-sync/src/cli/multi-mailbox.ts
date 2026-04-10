#!/usr/bin/env node
/**
 * Multi-mailbox CLI commands
 * 
 * Commands:
 *   sync --mailbox <id>       # Sync specific mailbox
 *   sync --all                # Sync all mailboxes
 *   status                    # Show status table
 *   init --add-to-existing    # Add mailbox to existing config
 */

import { resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { stderr } from "node:process";
import {
  loadMultiMailboxConfig,
  isMultiMailboxConfig,
  type MultiMailboxConfig,
  type MailboxConfig,
} from "../config/multi-mailbox.js";
import { syncMultiple, formatMultiSyncResult } from "../runner/multi-sync.js";
import { readMultiMailboxHealth, formatHealthTable } from "../health-multi.js";
import { createSecureStorage } from "../auth/secure-storage.js";

interface CLIOptions {
  configPath: string;
  mailbox?: string;
  all?: boolean;
  parallel?: number;
  addToExisting?: boolean;
}

function printUsage(): void {
  console.log(`
Usage: multi-mailbox <command> [options]

Commands:
  sync                    Sync mailboxes
    --mailbox <id>        Sync specific mailbox only
    --all                 Sync all mailboxes (default for multi-config)
    --parallel <n>        Override concurrency limit

  status                  Show status table for all mailboxes
    --mailbox <id>        Show status for specific mailbox

  init --add-to-existing  Add another mailbox to existing config

Options:
  --config <path>         Path to config file (default: ./config.json)
  --help                  Show this help
`);
}

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

async function detectConfigType(configPath: string): Promise<"single" | "multi" | "invalid"> {
  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    
    if (isMultiMailboxConfig(parsed)) {
      return "multi";
    }
    
    // Check if it has required single-config fields
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "mailbox_id" in parsed &&
      "root_dir" in parsed
    ) {
      return "single";
    }
    
    return "invalid";
  } catch {
    return "invalid";
  }
}

async function handleSync(options: CLIOptions): Promise<void> {
  const configPath = resolve(options.configPath);
  
  if (!existsSync(configPath)) {
    console.error(`Config file not found: ${configPath}`);
    process.exit(1);
  }

  const configType = await detectConfigType(configPath);
  
  if (configType === "invalid") {
    console.error(`Invalid config file: ${configPath}`);
    process.exit(1);
  }

  // Single mailbox config - use existing main.ts logic
  if (configType === "single") {
    console.log("Single mailbox config detected. Use the main CLI for single mailbox sync.");
    process.exit(1);
  }

  // Multi-mailbox config
  console.log(`Loading multi-mailbox config from: ${configPath}`);
  
  const secureStorage = await createSecureStorage("multi");
  const { config, valid, validationErrors } = await loadMultiMailboxConfig({
    path: configPath,
    storage: secureStorage,
  });

  if (!valid) {
    console.error("Config validation failed:");
    for (const [key, errors] of validationErrors) {
      console.error(`  ${key}:`);
      for (const error of errors) {
        console.error(`    - ${error}`);
      }
    }
    process.exit(1);
  }

  // Determine which mailboxes to sync
  const mailboxIds = options.mailbox ? [options.mailbox] : undefined;
  
  if (mailboxIds) {
    const mailbox = config.mailboxes.find(m => m.id === mailboxIds[0]);
    if (!mailbox) {
      console.error(`Mailbox not found: ${mailboxIds[0]}`);
      console.error(`Available mailboxes: ${config.mailboxes.map(m => m.id).join(", ")}`);
      process.exit(1);
    }
  }

  console.log(`\nStarting sync for ${mailboxIds?.length ?? config.mailboxes.length} mailbox(s)...`);
  console.log(`Concurrency: ${options.parallel ?? config.global?.max_concurrent_syncs ?? 2}`);
  console.log("");

  // Run sync
  const result = await syncMultiple(config, {
    mailboxIds,
    continueOnError: true,
    maxConcurrency: options.parallel,
    onMailboxComplete: (r) => {
      const status = r.success ? "✓" : "✗";
      console.log(`${status} ${r.mailboxId}: ${r.messagesSynced} messages in ${(r.durationMs / 1000).toFixed(1)}s`);
    },
  });

  console.log("\n" + formatMultiSyncResult(result));

  if (result.failures > 0) {
    process.exit(1);
  }
}

async function handleStatus(options: CLIOptions): Promise<void> {
  const configPath = resolve(options.configPath);
  
  if (!existsSync(configPath)) {
    console.error(`Config file not found: ${configPath}`);
    process.exit(1);
  }

  const configType = await detectConfigType(configPath);
  
  if (configType === "invalid") {
    console.error(`Invalid config file: ${configPath}`);
    process.exit(1);
  }

  if (configType === "single") {
    // For single config, read the single health file
    const raw = await readFile(configPath, "utf8");
    const config = JSON.parse(raw) as { root_dir?: string; mailbox_id?: string };
    const healthPath = resolve(config.root_dir ?? ".", ".health.json");
    
    if (!existsSync(healthPath)) {
      console.log("No health file found. Run sync first.");
      return;
    }

    const health = JSON.parse(await readFile(healthPath, "utf8")) as {
      status?: string;
      mailboxId?: string;
      lastSyncAt?: string;
      metrics?: { consecutiveFailures?: number };
    };

    console.log(`Mailbox: ${health.mailboxId ?? config.mailbox_id ?? "unknown"}`);
    console.log(`Status: ${health.status ?? "unknown"}`);
    console.log(`Last Sync: ${health.lastSyncAt ? new Date(health.lastSyncAt).toLocaleString() : "never"}`);
    console.log(`Consecutive Failures: ${health.metrics?.consecutiveFailures ?? 0}`);
    return;
  }

  // Multi-mailbox config
  const { config } = await loadMultiMailboxConfig({ path: configPath });
  
  if (config.mailboxes.length === 0) {
    console.log("No mailboxes configured.");
    return;
  }

  const healthPath = resolve(config.mailboxes[0].root_dir, ".multi-health.json");
  
  if (!existsSync(healthPath)) {
    console.log("No health file found. Run sync first.");
    return;
  }

  try {
    const health = await readMultiMailboxHealth(healthPath);
    
    if (options.mailbox) {
      // Show specific mailbox
      const mailboxHealth = health.mailboxes.get(options.mailbox);
      if (!mailboxHealth) {
        console.error(`Mailbox not found: ${options.mailbox}`);
        process.exit(1);
      }
      
      console.log(`Mailbox: ${mailboxHealth.mailboxId}`);
      console.log(`Status: ${mailboxHealth.status}`);
      console.log(`Last Sync: ${mailboxHealth.lastSync ? new Date(mailboxHealth.lastSync).toLocaleString() : "never"}`);
      console.log(`Last Success: ${mailboxHealth.lastSuccess ? new Date(mailboxHealth.lastSuccess).toLocaleString() : "never"}`);
      console.log(`Consecutive Failures: ${mailboxHealth.consecutiveFailures}`);
      console.log(`Total Messages: ${mailboxHealth.messagesTotal.toLocaleString()}`);
      if (mailboxHealth.error) {
        console.log(`Last Error: ${mailboxHealth.error}`);
      }
    } else {
      // Show table
      console.log(formatHealthTable(health));
      console.log("");
      console.log(`Overall: ${health.global.overallStatus.toUpperCase()}`);
      console.log(`Total Messages: ${health.global.totalMessages.toLocaleString()}`);
    }
  } catch (error) {
    console.error("Failed to read health file:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function handleInit(options: CLIOptions): Promise<void> {
  const configPath = resolve(options.configPath);

  if (!options.addToExisting) {
    console.log("Use --add-to-existing to add a mailbox to an existing config.");
    console.log("Or create a new config file manually.");
    return;
  }

  if (!existsSync(configPath)) {
    console.error(`Config file not found: ${configPath}`);
    process.exit(1);
  }

  const configType = await detectConfigType(configPath);
  
  if (configType === "invalid") {
    console.error(`Invalid config file: ${configPath}`);
    process.exit(1);
  }

  // Read existing config
  const raw = await readFile(configPath, "utf8");
  
  if (configType === "single") {
    // Convert single to multi
    const singleConfig = JSON.parse(raw) as {
      mailbox_id: string;
      root_dir: string;
      graph: Record<string, unknown>;
      scope?: Record<string, unknown>;
      normalize?: Record<string, unknown>;
      runtime?: Record<string, unknown>;
    };

    const multiConfig: MultiMailboxConfig = {
      mailboxes: [
        {
          id: singleConfig.mailbox_id.replace(/[^a-zA-Z0-9]/g, "_"),
          mailbox_id: singleConfig.mailbox_id,
          root_dir: singleConfig.root_dir,
          graph: singleConfig.graph as MailboxConfig["graph"],
          scope: singleConfig.scope as MailboxConfig["scope"],
          sync: {
            attachment_policy: (singleConfig.normalize?.attachment_policy as MailboxConfig["sync"]["attachment_policy"]) ?? "metadata_only",
            body_policy: (singleConfig.normalize?.body_policy as MailboxConfig["sync"]["body_policy"]) ?? "text_only",
            include_headers: (singleConfig.normalize?.include_headers as boolean) ?? false,
            tombstones_enabled: (singleConfig.normalize?.tombstones_enabled as boolean) ?? true,
            polling_interval_ms: (singleConfig.runtime?.polling_interval_ms as number) ?? 60000,
            acquire_lock_timeout_ms: (singleConfig.runtime?.acquire_lock_timeout_ms as number) ?? 30000,
            cleanup_tmp_on_startup: (singleConfig.runtime?.cleanup_tmp_on_startup as boolean) ?? true,
            rebuild_views_after_sync: (singleConfig.runtime?.rebuild_views_after_sync as boolean) ?? true,
          },
        },
      ],
      global: {
        max_concurrent_syncs: 2,
        resource_limits: {
          maxMemoryMB: 512,
          maxDiskIOPerSecond: 100,
          maxNetworkRequestsPerSecond: 50,
        },
        shutdown_timeout_ms: 30000,
      },
    };

    // Backup old config
    const backupPath = `${configPath}.backup`;
    await writeFile(backupPath, raw);
    console.log(`Backed up existing config to: ${backupPath}`);

    // Write new config
    await writeFile(configPath, JSON.stringify(multiConfig, null, 2));
    console.log(`Converted to multi-mailbox config: ${configPath}`);
    console.log(`\nEdit the file to add additional mailboxes.`);
    return;
  }

  // Already multi-config
  console.log("Config is already in multi-mailbox format.");
  console.log(`Edit ${configPath} to add additional mailboxes.`);
}

async function main(): Promise<void> {
  printDeprecationWarning();

  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printUsage();
    process.exit(0);
  }

  const command = args[0];
  const options: CLIOptions = {
    configPath: "./config.json",
  };

  // Parse arguments
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case "--config":
        if (nextArg) {
          options.configPath = nextArg;
          i++;
        }
        break;
      case "--mailbox":
        if (nextArg) {
          options.mailbox = nextArg;
          i++;
        }
        break;
      case "--all":
        options.all = true;
        break;
      case "--parallel":
        if (nextArg) {
          options.parallel = parseInt(nextArg, 10);
          i++;
        }
        break;
      case "--add-to-existing":
        options.addToExisting = true;
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
        break;
    }
  }

  switch (command) {
    case "sync":
      await handleSync(options);
      break;
    case "status":
      await handleStatus(options);
      break;
    case "init":
      await handleInit(options);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
