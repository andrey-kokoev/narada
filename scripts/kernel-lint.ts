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

export const KERNEL_DIRS = [
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

export const PATTERNS = [
  { name: "conversation_id", regex: /\bconversation_id\b/ },
  { name: "thread_id", regex: /\bthread_id\b/ },
  { name: "mailbox_id", regex: /\bmailbox_id\b/ },
  { name: "conversation_records", regex: /\bconversation_records\b/ },
  { name: "conversation_revisions", regex: /\bconversation_revisions\b/ },
  { name: "outbound_commands", regex: /\boutbound_commands\b/ },
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
  {
    name: "mail_compat_import",
    regex: /from\s+['"][^'"]*mail-compat-types[^'"]*['"]/,
  },
  {
    name: "mailbox_obs_import",
    regex: /from\s+['"][^'"]*observability\/mailbox[^'"]*['"]/,
  },
];

/**
 * Allowlist of known existing violations.
 * Key: file path relative to packages/exchange-fs-sync/src/
 * Value: array of allowed pattern names. Use ["*"] to allow all patterns in a file.
 */
export const ALLOWLIST: Record<string, string[]> = {
  // Rationale: charter envelope is a hybrid module. It contains the generic
  // `buildInvocationEnvelope` but also the mail-specific
  // `normalizeMessageForEnvelope` materializer which imports message
  // persistence and normalized message types.
  "charter/envelope.ts": [
    "persistence_messages_import",
    "normalized_types_import",
  ],

  // Rationale: `MailboxContextStrategy` is explicitly mail-vertical. It forms
  // PolicyContext from mailbox-specific facts (conversation_id / thread_id).
  "foreman/context.ts": ["conversation_id", "thread_id"],

  // Rationale: `DefaultForemanFacade` orchestrates mail-specific work opening.
  // It maps context_id ↔ conversation_id and scope_id ↔ mailbox_id when
  // building records for the mailbox compatibility layer.
  "foreman/facade.ts": [
    "conversation_id",
    "mailbox_id",
    "mail_compat_import",
  ],

  // Rationale: `OutboundHandoff` creates outbound commands from foreman
  // decisions. It uses conversation_id / mailbox_id when translating neutral
  // context/scope into mail-shaped outbound command rows.
  "foreman/handoff.ts": ["conversation_id", "mailbox_id"],

  // Rationale: `SqliteCoordinatorStore` implements migration from old
  // mailbox-era tables to neutral base tables, and retains compatibility
  // views + wrapper methods for the mail vertical.
  "coordinator/store.ts": [
    "conversation_id",
    "thread_id",
    "mailbox_id",
    "conversation_records",
    "conversation_revisions",
    "mail_compat_import",
  ],

  // Rationale: `thread-context.ts` hydrates mailbox-specific thread context
  // from filesystem views. It is inherently mail-vertical.
  "coordinator/thread-context.ts": [
    "conversation_id",
    "mailbox_id",
    "normalized_types_import",
    "mail_compat_import",
  ],

  // Rationale: `thread-id.ts` maps normalized messages to Exchange thread IDs.
  // It is inherently mail-vertical and references NormalizedMessage.
  "coordinator/thread-id.ts": [
    "conversation_id",
    "thread_id",
    "normalized_types_import",
  ],

  // Rationale: Dedicated mailbox compatibility type surface. Expected to
  // contain mail-era identifiers and imports from normalized types.
  "coordinator/mail-compat-types.ts": ["*"],

  // Rationale: `observability/mailbox-types.ts` is the dedicated mail-vertical
  // observation type surface. Generic modules must not import this file.
  "observability/mailbox-types.ts": ["conversation_id", "mailbox_id"],

  // Rationale: `observability/mailbox.ts` is the dedicated mail-vertical
  // observation query surface. Generic modules must not import this file.
  "observability/mailbox.ts": ["conversation_id", "mailbox_id"],
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

export interface StaleAllowlistEntry {
  file: string;
  pattern: string;
}

export function findStaleAllowlistEntries(): StaleAllowlistEntry[] {
  const stale: StaleAllowlistEntry[] = [];
  for (const [file, patterns] of Object.entries(ALLOWLIST)) {
    if (patterns.includes("*")) continue;
    const content = readFileSync(
      `packages/exchange-fs-sync/src/${file}`,
      "utf8",
    );
    for (const patternName of patterns) {
      const pattern = PATTERNS.find((p) => p.name === patternName);
      if (!pattern) continue;
      if (!pattern.regex.test(content)) {
        stale.push({ file, pattern: patternName });
      }
    }
  }
  return stale;
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

if (process.argv[1]?.includes("kernel-lint.ts")) {
  if (process.argv.includes("--stale")) {
    console.log(JSON.stringify(findStaleAllowlistEntries()));
    process.exit(0);
  }
  if (process.argv.includes("--stats")) {
    const fileKeys = Object.keys(ALLOWLIST).length;
    const patternCount = Object.values(ALLOWLIST).reduce(
      (sum, p) => sum + p.length,
      0,
    );
    console.log(JSON.stringify({ fileKeys, patternCount }));
    process.exit(0);
  }
  if (process.argv.includes("--wildcards")) {
    const wildcards = Object.entries(ALLOWLIST)
      .filter(([, p]) => p.includes("*"))
      .map(([f]) => f);
    console.log(JSON.stringify(wildcards));
    process.exit(0);
  }
  main();
}
