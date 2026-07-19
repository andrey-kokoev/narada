#!/usr/bin/env node
/**
 * sibling-workspace-state-guard
 *
 * narada's pnpm workspace deliberately spans sibling repositories
 * (../narada-core, ../mcp-surfaces, ../agent-cli, ../agent-tui), so
 * `pnpm build` / `pnpm typecheck` / tests consume those checkouts' LIVE,
 * possibly uncommitted state. That has broken this repo's build mid-session
 * (2026-07-18: uncommitted narada-core TaskSpecRecord.tags → CLI TS2741).
 *
 * This guard converts silent breakage into an explicit warning: it lists
 * each sibling repo's uncommitted files before the build starts.
 *
 * Modes (env NARADA_SIBLING_GUARD):
 *   warn   (default) print the warning, exit 0
 *   strict print the warning, exit 1 when any sibling repo is dirty
 *   off    skip entirely
 *
 * Decision record: .ai/decisions/20260719-2067-agent-context-session-start-convergence.md
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGovernedCommandSync } from '../packages/process-launch-posture/src/index.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const mode = (process.env.NARADA_SIBLING_GUARD ?? 'warn').trim().toLowerCase();

if (mode === 'off') {
  process.exit(0);
}

const MAX_FILES_PER_REPO = 15;

function siblingRepoRoots() {
  const workspaceYaml = readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8');
  const names = new Set();
  for (const match of workspaceYaml.matchAll(/^\s*-\s*['"]?\.\.\/([^/'"]+)/gm)) {
    names.add(match[1]);
  }
  return [...names]
    .map((name) => join(repoRoot, '..', name))
    .filter((root) => existsSync(join(root, '.git')));
}

function dirtyEntries(root) {
  const result = runGovernedCommandSync('git', ['-C', root, 'status', '--porcelain'], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    return { error: result.error?.message ?? `git status exited ${result.status}` };
  }
  const lines = String(result.stdout).split(/\r?\n/).filter(Boolean);
  return { lines };
}

const roots = siblingRepoRoots();
const report = [];
for (const root of roots) {
  const { lines, error } = dirtyEntries(root);
  if (error) {
    report.push({ root, error });
  } else if (lines.length > 0) {
    report.push({ root, lines });
  }
}

if (report.length === 0) {
  console.log(`sibling-workspace-state guard ok: ${roots.length} sibling repos clean`);
  process.exit(0);
}

console.warn('');
console.warn('================================================================');
console.warn(' WARNING: sibling workspace repos have uncommitted state');
console.warn('================================================================');
console.warn(' narada builds/typechecks/tests consume sibling checkouts\' LIVE');
console.warn(' state (pnpm-workspace.yaml spans ../narada-core, ../mcp-surfaces,');
console.warn(' ../agent-cli, ../agent-tui). Failures from here on may originate');
console.warn(' in those repos, not in narada.');
console.warn('');
for (const entry of report) {
  console.warn(` ${entry.root}`);
  if (entry.error) {
    console.warn(`   ! could not read git status: ${entry.error}`);
    continue;
  }
  const shown = entry.lines.slice(0, MAX_FILES_PER_REPO);
  for (const line of shown) {
    console.warn(`   ${line}`);
  }
  if (entry.lines.length > shown.length) {
    console.warn(`   ... and ${entry.lines.length - shown.length} more`);
  }
}
console.warn('');
console.warn(' To proceed quietly: commit or stash in the sibling repos.');
console.warn(' NARADA_SIBLING_GUARD=off silences this guard; =strict fails the build.');
console.warn('');

if (mode === 'strict') {
  process.exit(1);
}
