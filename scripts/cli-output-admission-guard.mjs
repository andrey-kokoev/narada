#!/usr/bin/env node
/**
 * CLI output admission guard.
 *
 * Finite command implementations should construct output as returned data and
 * let the shared CLI output layer admit it to stdout/stderr. Existing legacy
 * command bodies are allowlisted with counts so new direct output is explicit.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const COMMANDS_DIR = "packages/layers/cli/src/commands";
const DIRECT_OUTPUT_RE = /\bconsole\.(log|error|warn)\s*\(|\bprocess\.exit\s*\(/;
const reportMode = process.argv.includes("--report");

const allowlist = {
  "config-interactive.ts": [
    { pattern: /process\.exit\(0\)/, count: 1, reason: "interactive cancellation path" },
    { pattern: /console\.log\(''\)/, count: 1, reason: "legacy interactive next-step spacing" },
    { pattern: /console\.log\('  1\. Set environment variables for Graph API auth:'\)/, count: 1, reason: "legacy interactive next-step output" },
    { pattern: /console\.log\('     export GRAPH_TENANT_ID=your-tenant-id'\)/, count: 1, reason: "legacy interactive next-step output" },
    { pattern: /console\.log\('     export GRAPH_CLIENT_ID=your-client-id'\)/, count: 1, reason: "legacy interactive next-step output" },
    { pattern: /console\.log\('     export GRAPH_CLIENT_SECRET=your-client-secret'\)/, count: 1, reason: "legacy interactive next-step output" },
    { pattern: /console\.log\('  2\. Run: narada sync'\)/, count: 1, reason: "legacy interactive next-step output" },
  ],
  "usc-init.ts": [
    { pattern: /console\.log\(/, count: 16, reason: "legacy USC init progress and summary output" },
    { pattern: /console\.error\(`FAIL \$\{result\.name\}`\)/, count: 1, reason: "legacy USC init validation output" },
    { pattern: /console\.error\(`  \$\{err\}`\)/, count: 1, reason: "legacy USC init validation output" },
  ],
};

function commandFiles() {
  return readdirSync(COMMANDS_DIR)
    .filter((file) => file.endsWith(".ts"))
    .sort();
}

function findDirectOutput(file) {
  const text = readFileSync(join(COMMANDS_DIR, file), "utf8");
  return text
    .split("\n")
    .map((lineText, idx) => ({ file, line: idx + 1, text: lineText.trim() }))
    .filter((match) => DIRECT_OUTPUT_RE.test(match.text));
}

function allowanceKey(file, allowanceIndex) {
  return `${file}#${allowanceIndex}`;
}

const violations = [];
const observedCounts = new Map();
const matchedAllowances = new Map();

for (const file of commandFiles()) {
  const allowances = allowlist[file] ?? [];
  for (const match of findDirectOutput(file)) {
    const allowanceIndex = allowances.findIndex((allowance) => allowance.pattern.test(match.text));
    if (allowanceIndex === -1) {
      violations.push(`${match.file}:${match.line}: direct output is not allowlisted: ${match.text}`);
      continue;
    }
    const key = allowanceKey(file, allowanceIndex);
    observedCounts.set(key, (observedCounts.get(key) ?? 0) + 1);
    const existing = matchedAllowances.get(file) ?? { count: 0, reasons: new Set() };
    existing.count += 1;
    existing.reasons.add(allowances[allowanceIndex].reason);
    matchedAllowances.set(file, existing);
  }
}

for (const [file, allowances] of Object.entries(allowlist)) {
  for (const [idx, allowance] of allowances.entries()) {
    const observed = observedCounts.get(allowanceKey(file, idx)) ?? 0;
    if (observed !== allowance.count) {
      violations.push(
        `${file}: allowlist drift for ${allowance.pattern}: expected ${allowance.count}, observed ${observed} (${allowance.reason})`,
      );
    }
  }
}

if (violations.length > 0) {
  console.error("CLI Output Admission Guard failed.");
  console.error("");
  for (const violation of violations.slice(0, 40)) {
    console.error(`  - ${violation}`);
  }
  if (violations.length > 40) {
    console.error(`  ... and ${violations.length - 40} more`);
  }
  console.error("");
  console.error("Use returned command results with _formatted output, or add a precise allowlist entry with a rationale.");
  process.exit(1);
}

const allowanceCount = Object.values(allowlist).reduce((sum, entries) => sum + entries.length, 0);
if (reportMode) {
  const totalDirectOutput = Array.from(matchedAllowances.values()).reduce((sum, entry) => sum + entry.count, 0);
  console.log(`CLI Output Admission Debt: ${totalDirectOutput} allowlisted direct-output site(s), ${allowanceCount} allowance rule(s).`);
  for (const [file, entry] of Array.from(matchedAllowances.entries()).sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))) {
    console.log(`${String(entry.count).padStart(3)}  ${file}  ${Array.from(entry.reasons).join("; ")}`);
  }
} else {
  console.log(`CLI Output Admission Guard passed. ${allowanceCount} explicit allowance(s).`);
}
