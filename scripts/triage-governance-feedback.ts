#!/usr/bin/env tsx
/**
 * Governance Feedback Triage Script
 *
 * Parses `.ai/feedback/governance.md` and prints a severity summary,
 * plus suggestions for USC schema areas that may need updates.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface FeedbackEntry {
  date: string;
  agentId: string;
  taskId: string;
  severity: string;
  scope: string;
}

const SEVERITY_ORDER = ['blocking', 'material', 'minor'];
const SCOPE_TO_SCHEMA_HINT: Record<string, string> = {
  'local task': 'task-graph schema',
  chapter: 'construction-state schema',
  'repo governance': 'validator and governance schemas',
  'USC-level': 'USC core schemas (construction-state, task-graph, cycle)',
};

function parseGovernanceFeedback(content: string): FeedbackEntry[] {
  const entries: FeedbackEntry[] = [];

  // Split by entry headers: ## YYYY-MM-DD / agent-id / task-id
  const entryRegex = /^##\s+(\d{4}-\d{2}-\d{2})\s+\/\s+([^/]+)\s+\/\s+(.+)$/gm;
  const matches = [...content.matchAll(entryRegex)];

  for (let i = 0; i < matches.length; i++) {
    const [, date, agentId, taskId] = matches[i];
    const startIndex = matches[i].index!;
    const endIndex = i + 1 < matches.length ? matches[i + 1].index! : content.length;
    const section = content.slice(startIndex, endIndex);

    const severityMatch = section.match(/###\s+Severity\s*\n\s*(\S+)/i);
    const scopeMatch = section.match(/###\s+Scope\s*\n\s*(\S[^\n]*)/i);

    entries.push({
      date,
      agentId: agentId.trim(),
      taskId: taskId.trim(),
      severity: severityMatch ? severityMatch[1].toLowerCase() : 'unknown',
      scope: scopeMatch ? scopeMatch[1].trim().toLowerCase() : 'unknown',
    });
  }

  return entries;
}

function main(): void {
  const feedbackPath = resolve(process.cwd(), '.ai', 'feedback', 'governance.md');

  let content: string;
  try {
    content = readFileSync(feedbackPath, 'utf8');
  } catch {
    console.error('Error: Could not read .ai/feedback/governance.md');
    console.error('Run this script from the repo root.');
    process.exit(1);
  }

  const entries = parseGovernanceFeedback(content);

  if (entries.length === 0) {
    console.log('No governance feedback entries found.');
    console.log('The inbox is empty — nothing to triage.');
    return;
  }

  const counts: Record<string, number> = { blocking: 0, material: 0, minor: 0, unknown: 0 };
  const scopeCounts: Record<string, number> = {};

  for (const entry of entries) {
    counts[entry.severity] = (counts[entry.severity] || 0) + 1;
    scopeCounts[entry.scope] = (scopeCounts[entry.scope] || 0) + 1;
  }

  console.log('Governance Feedback Triage Summary');
  console.log('==================================');
  console.log(`Total entries: ${entries.length}`);
  console.log('');
  console.log('By severity:');
  for (const sev of SEVERITY_ORDER) {
    const c = counts[sev] || 0;
    if (c > 0) {
      console.log(`  ${sev.padEnd(10)} ${c}`);
    }
  }
  if (counts.unknown > 0) {
    console.log(`  ${'unknown'.padEnd(10)} ${counts.unknown}`);
  }

  console.log('');
  console.log('By scope:');
  for (const [scope, c] of Object.entries(scopeCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${scope.padEnd(20)} ${c}`);
  }

  console.log('');
  console.log('Suggested schema areas to review:');
  const seenHints = new Set<string>();
  for (const [scope, c] of Object.entries(scopeCounts).sort((a, b) => b[1] - a[1])) {
    const hint = SCOPE_TO_SCHEMA_HINT[scope];
    if (hint && !seenHints.has(hint)) {
      seenHints.add(hint);
      console.log(`  • ${hint} (${c} item${c > 1 ? 's' : ''} in scope "${scope}")`);
    }
  }
  if (seenHints.size === 0) {
    console.log('  (no recognized scopes with schema mappings)');
  }

  console.log('');
  console.log('Action required:');
  const totalHigh = (counts.blocking || 0) + (counts.material || 0);
  if (totalHigh > 0) {
    console.log(`  → ${totalHigh} high-priority item${totalHigh > 1 ? 's' : ''} await human review.`);
  } else {
    console.log('  → All items are low severity. Review at next maintenance window.');
  }
}

main();
