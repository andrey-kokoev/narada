#!/usr/bin/env node
import { Command } from "commander";
import { syncCommand } from "./commands/sync.js";
import { integrityCommand } from "./commands/integrity.js";
import { rebuildViewsCommand } from "./commands/rebuild-views.js";
import { configCommand } from "./commands/config.js";

const program = new Command();

program
  .name("exchange-sync")
  .description("Exchange filesystem synchronization CLI")
  .version("1.0.0");

program
  .command("sync")
  .description("Run a single synchronization cycle")
  .option("-c, --config <path>", "Path to config file", "./config.json")
  .option("-v, --verbose", "Enable verbose output", false)
  .action(async (options) => {
    try {
      await syncCommand(options);
    } catch (err) {
      console.error(JSON.stringify({
        status: "fatal_failure",
        error: (err as Error).message,
      }, null, 2));
      process.exit(1);
    }
  });

program
  .command("integrity")
  .description("Check data integrity")
  .option("-c, --config <path>", "Path to config file", "./config.json")
  .option("-v, --verbose", "Enable verbose output", false)
  .action(async (options) => {
    try {
      await integrityCommand(options);
    } catch (err) {
      console.error(JSON.stringify({
        status: "error",
        error: (err as Error).message,
      }, null, 2));
      process.exit(1);
    }
  });

program
  .command("rebuild-views")
  .description("Rebuild all derived views")
  .option("-c, --config <path>", "Path to config file", "./config.json")
  .option("-v, --verbose", "Enable verbose output", false)
  .action(async (options) => {
    try {
      await rebuildViewsCommand(options);
    } catch (err) {
      console.error(JSON.stringify({
        status: "error",
        error: (err as Error).message,
      }, null, 2));
      process.exit(1);
    }
  });

program
  .command("init")
  .description("Create a new configuration file")
  .option("-o, --output <path>", "Output path for config file", "./config.json")
  .option("-f, --force", "Overwrite existing file", false)
  .action(async (options) => {
    try {
      await configCommand(options);
    } catch (err) {
      console.error(JSON.stringify({
        status: "error",
        error: (err as Error).message,
      }, null, 2));
      process.exit(1);
    }
  });

program.parse();
