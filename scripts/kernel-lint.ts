#!/usr/bin/env tsx
/**
 * Kernel Invariant Lint
 *
 * Enforces that kernel modules remain domain-neutral and do not leak
 * mailbox-specific concepts (conversation_id, thread_id, Graph types).
 *
 * CI runs this script; new violations cause build failure.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

interface Violation {
  file: string;
  line: number;
  pattern: string;
  snippet: string;
}

const KERNEL_DIRS = [
  "packages/exchange-fs-sync/src/scheduler",
  "packages/exchange-fs-sync/src/facts",
  "packages/exchange-fs-sync/src/intent",
  "packages/exchange-fs-sync/src/sources",
  "packages/exchange-fs-sync/src/executors",
  "packages/exchange-fs-sync/src/charter",
  "packages/exchange-fs-sync/src/foreman",
  "packages/exchange-fs-sync/src/coordinator",
  "packages/exchange-fs-sync/src/observability",
];

const PATTERNS = [
  { name: "conversation_id", regex: /\bconversation_id\b/ },
  { name: "thread_id", regex: /\bthread_id\b/ },
  {
    name: "graph_adapter_import",
    regex: /from\s+['"][^'"]*adapter\/graph[^'"]*['"]/,
  },
  {
    name: "normalize_import",
    regex: /from\s+['"][^'"]*normalize\/[^'"]*['"]/,
  },
  {
    name: "projector_import",
    regex: /from\s+['"][^'"]*projector\/[^'"]*['"]/,
  },
  {
    name: "persistence_messages_import",
    regex: /from\s+['"][^'"]*persistence\/messages[^'"]*['"]/,
  },
  {
    name: "persistence_views_import",
    regex: /from\s+['"][^'"]*persistence\/views[^'"]*['"]/,
  },
  {
    name: "normalized_types_import",
    regex: /from\s+['"][^'"]*types\/normalized[^'"]*['"]/,
  },
  {
    name: "graph_types_import",
    regex: /from\s+['"][^'"]*types\/graph[^'"]*['"]/,
  },
];

/**
 * Allowlist of known existing violations.
 * Key: file path relative to packages/exchange-fs-sync/src/
 * Value: array of allowed pattern names. Use ["*"] to allow all patterns in a file.
 */
const ALLOWLIST: Record<string, string[]> = {
  // Charter envelope contains mail-specific materializer alongside generic builders.
  "charter/envelope.ts": [
    "persistence_messages_import",
    "normalized_types_import",
  ],

  // Foreman context strategies include mail-specific formation.
  "foreman/context.ts": ["conversation_id", "thread_id"],

  // Foreman facade orchestrates mail-specific conversation opening.
  "foreman/facade.ts": ["conversation_id"],

  // Foreman handoff creates outbound commands for conversations.
  "foreman/handoff.ts": ["conversation_id"],

  // Foreman types include mail-vertical context types.
  "foreman/types.ts": ["conversation_id"],

  // Coordinator retains legacy thread/conversation tables for mail vertical.
  "coordinator/store.ts": ["conversation_id", "thread_id"],

  // Thread context hydration is mail-specific.
  "coordinator/thread-context.ts": [
    "conversation_id",
    "normalized_types_import",
  ],

  // Thread ID mapping is explicitly mail-specific.
  "coordinator/thread-id.ts": [
    "conversation_id",
    "thread_id",
    "normalized_types_import",
  ],

  // Coordinator types include mail-specific conversation records.
  "coordinator/types.ts": ["conversation_id", "normalized_types_import"],

  // Observability reads from mail-specific tables.
  "observability/queries.ts": ["conversation_id"],
  "observability/types.ts": ["conversation_id"],
};

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, files);
    } else if (entry.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

function getSnippet(line: string, matchIndex: number): string {
  const start = Math.max(0, matchIndex - 20);
  const end = Math.min(line.length, matchIndex + 40);
  return line.slice(start, end).trim();
}

function main(): void {
  const violations: Violation[] = [];

  for (const dir of KERNEL_DIRS) {
    const files = walk(dir);
    for (const file of files) {
      const rel = relative("packages/exchange-fs-sync/src", file).replace(
        /\\/g,
        "/",
      );
      const allowed = ALLOWLIST[rel] ?? [];
      if (allowed.includes("*")) {
        continue;
      }

      const content = readFileSync(file, "utf8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const pattern of PATTERNS) {
          if (allowed.includes(pattern.name)) {
            continue;
          }
          const match = pattern.regex.exec(line);
          if (match) {
            violations.push({
              file: rel,
              line: i + 1,
              pattern: pattern.name,
              snippet: getSnippet(line, match.index),
            });
          }
        }
      }
    }
  }

  if (violations.length === 0) {
    console.log("✅ Kernel lint passed — no mailbox leakage detected.");
    process.exit(0);
  }

  console.error("❌ Kernel invariant violations detected:");
  console.error(
    "   New kernel code must not reference mailbox-specific concepts.\n",
  );

  const byFile = new Map<string, Violation[]>();
  for (const v of violations) {
    const list = byFile.get(v.file) ?? [];
    list.push(v);
    byFile.set(v.file, list);
  }

  for (const [file, list] of byFile) {
    console.error(`  ${file}`);
    for (const v of list) {
      console.error(
        `    line ${v.line}  [${v.pattern}]  ${v.snippet ? `  "${v.snippet}"` : ""}`,
      );
    }
  }

  console.error("\n📝 To fix:");
  console.error(
    "  • Move mailbox-specific logic into adapter/, normalize/, projector/, or persistence/",
  );
  console.error(
    "  • Use context_id / scope_id in kernel modules instead of conversation_id / mailbox_id",
  );
  console.error(
    "  • If this is intentional legacy code, add the pattern to ALLOWLIST in scripts/kernel-lint.ts",
  );

  process.exit(1);
}

main();
