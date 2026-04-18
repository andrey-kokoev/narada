#!/usr/bin/env node
import { Command } from "commander";
import { wantMailbox } from "./commands/want-mailbox.js";
import { wantWorkflow } from "./commands/want-workflow.js";
import { wantPosture } from "./commands/want-posture.js";
import { setup } from "./commands/setup.js";
import { activate } from "./commands/activate.js";
import { inspect } from "./commands/inspect.js";
import { explain } from "./commands/explain.js";
import { renderTargetPreflight } from "./commands/preflight.js";
import { initRepo } from "./commands/init-repo.js";
import type { PosturePreset } from "./intents/posture.js";

const program = new Command();
program.name("narada");

program.command("want-mailbox")
  .argument("<mailbox-id>")
  .option("-c, --config <path>")
  .option("--primary-charter <charter>")
  .option("--secondary-charters <charters>")
  .option("--posture <preset>")
  .action((mailboxId, opts) => {
    const result = wantMailbox(mailboxId, {
      configPath: opts.config,
      primaryCharter: opts.primaryCharter,
      secondaryCharters: opts.secondaryCharters ? String(opts.secondaryCharters).split(",") : undefined,
      posture: opts.posture,
    });
    console.log(result.summary);
  });

program.command("want-workflow")
  .argument("<workflow-id>")
  .requiredOption("--schedule <schedule>")
  .option("-c, --config <path>")
  .option("--primary-charter <charter>")
  .option("--posture <preset>")
  .action((workflowId, opts) => {
    const result = wantWorkflow(workflowId, {
      configPath: opts.config,
      primaryCharter: opts.primaryCharter,
      schedule: opts.schedule,
      posture: opts.posture,
    });
    console.log(result.summary);
  });

program.command("want-posture")
  .argument("<target>")
  .argument("<preset>")
  .option("-c, --config <path>")
  .action((target, preset, opts) => {
    const result = wantPosture(target, preset as PosturePreset, { configPath: opts.config });
    console.log(`${result.target}: ${result.preset} applied`);
    console.log(result.description);
  });

program.command("setup")
  .argument("[target]")
  .option("-c, --config <path>")
  .action((target, opts) => {
    const result = setup({ target, configPath: opts.config });
    console.log(result.summary);
  });

program.command("preflight")
  .argument("<operation>")
  .option("-c, --config <path>")
  .action((scopeId, opts) => {
    console.log(renderTargetPreflight(scopeId, { configPath: opts.config }));
  });

program.command("inspect")
  .argument("<operation>")
  .option("-c, --config <path>")
  .action((scopeId, opts) => {
    console.log(inspect(scopeId, { configPath: opts.config }).summary);
  });

program.command("explain")
  .argument("<operation>")
  .option("-c, --config <path>")
  .action((scopeId, opts) => {
    const result = explain(scopeId, { configPath: opts.config });
    console.log(`Target: ${result.target}`);
    console.log(`Why no action: ${result.whyNoAction}`);
    if (result.operationalConsequences.length) {
      console.log("Operational consequences:");
      for (const line of result.operationalConsequences) console.log(`- ${line}`);
    }
    if (result.blockers.length) {
      console.log("Blockers:");
      for (const line of result.blockers) console.log(`- ${line}`);
    }
  });

program.command("activate")
  .argument("<operation>")
  .option("-c, --config <path>")
  .action((scopeId, opts) => {
    const result = activate(scopeId, { configPath: opts.config });
    if (!result.activated) {
      console.error(result.reason ?? "Activation failed");
      process.exitCode = 1;
      return;
    }
    console.log(`${scopeId} is now activated.`);
    console.log("Activation marks this operation as live. It does not start the daemon or send mail.");
    console.log(`When the daemon runs, Narada will process ${scopeId} according to its configured policy.`);
    console.log(`Activated at: ${result.activatedAt}`);
  });

program.command("init-repo")
  .argument("<path>")
  .option("-n, --name <name>", "package name for the generated repo")
  .action((repoPath, opts) => {
    const result = initRepo(repoPath, { name: opts.name });
    console.log(result.summary);
    console.log("\nCreated:");
    for (const f of result.createdFiles) console.log(`  ${f}`);
    console.log("\nGold path — run these next:");
    for (const step of result.nextSteps) console.log(`  ${step}`);
    console.log("\nSee README.md in the repo for the full first-run guide.");
  });

program.parse();
