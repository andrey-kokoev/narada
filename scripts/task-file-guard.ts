#!/usr/bin/env tsx
/**
 * Task File Guard
 *
 * Scans .ai/tasks/ and fails if forbidden derivative filename patterns are present.
 * Forbidden patterns: *-EXECUTED.md, *-DONE.md, *-RESULT.md, *-FINAL.md, *-SUPERSEDED.md
 *
 * Task files are durable artifacts. Execution evidence belongs in the original file.
 * See AGENTS.md "Task File Policy".
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";

const TASKS_DIR = join(process.cwd(), ".ai", "tasks");

const FORBIDDEN_PATTERNS = [
  { pattern: /-EXECUTED\.md$/i, name: "-EXECUTED.md" },
  { pattern: /-DONE\.md$/i, name: "-DONE.md" },
  { pattern: /-RESULT\.md$/i, name: "-RESULT.md" },
  { pattern: /-FINAL\.md$/i, name: "-FINAL.md" },
  { pattern: /-SUPERSEDED\.md$/i, name: "-SUPERSEDED.md" },
];

function scan(): string[] {
  const violations: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(TASKS_DIR);
  } catch {
    // No tasks directory — nothing to violate
    return violations;
  }

  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;
    for (const { pattern, name } of FORBIDDEN_PATTERNS) {
      if (pattern.test(entry)) {
        violations.push(`${entry} (forbidden suffix: ${name})`);
        break;
      }
    }
  }

  return violations;
}

const violations = scan();

if (violations.length > 0) {
  console.error("Task File Guard failed.");
  console.error("");
  console.error("Forbidden derivative task filenames found in .ai/tasks/:");
  for (const v of violations) {
    console.error(`  - ${v}`);
  }
  console.error("");
  console.error("Expected replacement:");
  console.error("  - Keep the original task file as the canonical artifact.");
  console.error("  - Write execution evidence inside the original file under a section such as");
  console.error("    '## Execution Notes', '## Verification', or '## Outcome'.");
  console.error("  - Do not create sibling status files like -EXECUTED, -RESULT, -SUPERSEDED, etc.");
  console.error("");
  console.error("See AGENTS.md 'Task File Policy' for the full rule.");
  process.exit(1);
} else {
  console.log("Task File Guard passed. No forbidden derivative task filenames found.");
}
