#!/usr/bin/env tsx
/**
 * Focused Test Runner with Telemetry
 *
 * Runs a single focused test command and records timing + classification
 * to `.ai/metrics/test-runtimes.json`. This makes focused verification
 * visible alongside broad wrapper commands.
 *
 * Usage:
 *   pnpm test:focused "pnpm --filter @narada2/control-plane exec vitest run test/unit/ids/event-id.test.ts"
 *   ALLOW_MULTI_FILE_FOCUSED=1 pnpm test:focused "pnpm --filter @narada2/cli exec vitest run test/commands/a.test.ts test/commands/b.test.ts"
 *   ALLOW_PACKAGE_FOCUSED=1 pnpm test:focused "pnpm --filter @narada2/charters test"
 */

import {
  runStep,
  recordRun,
  classifyStep,
  printMetricsHint,
} from "./test-telemetry.js";

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  dim: "\x1b[2m",
};

const rawCommand = process.argv.slice(2).join(" ");

function normalizeFocusedCommand(command: string): string {
  const promoteSuite = "test/commands/task-promote-recommendation.test.ts";
  const rosterSuite = "test/commands/task-roster.test.ts";
  if (
    /@narada2\/cli/.test(command) &&
    /\bvitest\s+run\b/.test(command) &&
    command.includes(promoteSuite)
  ) {
    const testNameMatch = command.match(/(?:-t|--testNamePattern)\s+(['"])(.*?)\1/);
    const testName = testNameMatch?.[2] ?? "";
    const envPrefix = testName
      ? `NARADA_PROOF_TEST_NAME_PATTERN=${JSON.stringify(testName)} `
      : "";
    return `${envPrefix}node scripts/cli-focused-proof.mjs task-promote-recommendation`;
  }
  if (
    /@narada2\/cli/.test(command) &&
    /\bvitest\s+run\b/.test(command) &&
    command.includes(rosterSuite)
  ) {
    const testNameMatch = command.match(/(?:-t|--testNamePattern)\s+(['"])(.*?)\1/);
    const testName = testNameMatch?.[2] ?? "";
    const envPrefix = testName
      ? `NARADA_PROOF_TEST_NAME_PATTERN=${JSON.stringify(testName)} `
      : "NARADA_PROOF_MODE=compact ";
    return `${envPrefix}node scripts/cli-focused-proof.mjs task-roster`;
  }

  const isCliVitestSingleFile =
    /@narada2\/cli/.test(command) &&
    /\bvitest\s+run\b/.test(command) &&
    (command.match(/\S+\.(?:test|spec)\.[cm]?[tj]sx?/g) ?? []).length === 1;

  if (!isCliVitestSingleFile) {
    return command;
  }

  let normalized = command;

  // SQLite-heavy CLI command tests are materially more stable in a single fork.
  // Apply the posture mechanically in the focused runner so agents/operators
  // don't have to remember the flag stack.
  const appendIfMissing = (pattern: RegExp, text: string) => {
    if (!pattern.test(normalized)) {
      normalized += ` ${text}`;
    }
  };

  appendIfMissing(/\s--pool(?:=|\s+)/, "--pool=forks");
  appendIfMissing(/\s--(?:no-)?file-parallelism\b/, "--no-file-parallelism");
  appendIfMissing(/\s--maxWorkers(?:=|\s+)/, "--maxWorkers=1");
  appendIfMissing(/\s--minWorkers(?:=|\s+)/, "--minWorkers=1");
  appendIfMissing(/\s--testTimeout(?:=|\s+)/, "--testTimeout=120000");
  appendIfMissing(/\s--hookTimeout(?:=|\s+)/, "--hookTimeout=120000");
  appendIfMissing(/\s--reporter(?:=|\s+)/, "--reporter=dot");

  if (!/\bNARADA_CLI_SQLITE_FOCUSED=1\b/.test(normalized)) {
    normalized = `NARADA_CLI_SQLITE_FOCUSED=1 ${normalized}`;
  }

  return normalized;
}

function rejectPreflight(reason: string): never {
  const now = new Date().toISOString();
  console.error(`${colors.red}Focused test rejected.${colors.reset}`);
  console.error(reason);
  console.error("");
  console.error("Default focused verification must target exactly one test file.");
  console.error("Overrides:");
  console.error("  ALLOW_MULTI_FILE_FOCUSED=1  allow multiple test files in one command");
  console.error("  ALLOW_PACKAGE_FOCUSED=1     allow package-level test commands");

  recordRun({
    command: rawCommand,
    startedAt: now,
    finishedAt: now,
    durationMs: 0,
    exitStatus: 1,
    exitSignal: null,
    stepTimings: [
      {
        name: "Focused test preflight",
        command: rawCommand,
        durationMs: 0,
        exitStatus: 1,
      },
    ],
    classification: "assertion-failure",
    summary: `Focused test preflight rejected: ${reason}`,
  });

  printMetricsHint();
  process.exit(1);
}

function validateFocusedCommand(command: string): void {
  const testFileMatches = command.match(/\S+\.(?:test|spec)\.[cm]?[tj]sx?/g) ?? [];
  const testFileCount = testFileMatches.length;
  const allowMultiFile = process.env.ALLOW_MULTI_FILE_FOCUSED === "1";
  const allowPackage = process.env.ALLOW_PACKAGE_FOCUSED === "1";
  const looksLikeFullSuite =
    /\btest:full\b/.test(command) ||
    /\bALLOW_FULL_TESTS=1\b/.test(command) ||
    /\bpnpm\s+test\b/.test(command);
  const looksLikePackageTest =
    /\bpnpm\b/.test(command) &&
    (
      /\btest(?::[A-Za-z0-9_-]+)?\b/.test(command) ||
      /\bvitest\s+run\b/.test(command)
    );

  if (looksLikeFullSuite) {
    rejectPreflight("Full-suite commands must not be wrapped in pnpm test:focused.");
  }

  if (testFileCount === 1) return;

  if (testFileCount > 1) {
    if (allowMultiFile) return;
    rejectPreflight(
      `Command includes ${testFileCount} test files: ${testFileMatches.join(", ")}`,
    );
  }

  if (looksLikePackageTest) {
    if (allowPackage) return;
    rejectPreflight(
      "Package-level test command has no explicit test file. Use one test file or set ALLOW_PACKAGE_FOCUSED=1.",
    );
  }
}

if (!rawCommand) {
  console.error(`${colors.red}Usage: pnpm test:focused "<command>"${colors.reset}`);
  console.error("");
  console.error("Examples:");
  console.error('  pnpm test:focused "pnpm --filter @narada2/control-plane exec vitest run test/unit/ids/event-id.test.ts"');
  console.error('  ALLOW_MULTI_FILE_FOCUSED=1 pnpm test:focused "pnpm --filter @narada2/cli exec vitest run test/commands/a.test.ts test/commands/b.test.ts"');
  console.error('  ALLOW_PACKAGE_FOCUSED=1 pnpm test:focused "pnpm --filter @narada2/charters test"');
  process.exit(1);
}

validateFocusedCommand(rawCommand);
const focusedCommand = normalizeFocusedCommand(rawCommand);

console.log(`${colors.dim}=== Focused Test ===${colors.reset}`);
console.log(`${colors.dim}Command:${colors.reset} ${focusedCommand}\n`);

const startedAt = new Date().toISOString();
const result = runStep({
  name: "Focused test",
  command: focusedCommand,
  stdio: "inherit",
});
const finishedAt = new Date().toISOString();

const classification = classifyStep(result.exitStatus, result.stderr, result.stdout);

recordRun({
  command: focusedCommand,
  startedAt,
  finishedAt,
  durationMs: result.durationMs,
  exitStatus: result.exitStatus,
  exitSignal: null,
  stepTimings: [
    {
      name: "Focused test",
      command: rawCommand,
      durationMs: result.durationMs,
      exitStatus: result.exitStatus,
    },
  ],
  classification,
  summary:
    classification === "known-teardown-noise"
      ? "Tests passed; known better-sqlite3 teardown noise"
      : classification === "success"
        ? "Focused test passed"
        : "Focused test failed",
});

printMetricsHint();

if (result.exitStatus !== 0 && classification !== "known-teardown-noise") {
  process.exit(result.exitStatus ?? 1);
}

if (classification === "known-teardown-noise") {
  console.log(
    `\n${colors.yellow}⚠ Known teardown noise detected (${result.exitStatus}).${colors.reset}`,
  );
  console.log(
    `${colors.dim}   This is a harmless better-sqlite3 cleanup artifact that occurs after all tests pass.${colors.reset}`,
  );
}
