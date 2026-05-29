#!/usr/bin/env node
/**
 * cleanup-tmp.mjs
 *
 * Remove accumulated tmp files and runtime artifacts from the Narada Site.
 *
 * Targets:
 *   - tmp-changed-*.json (task finish artifacts)
 *   - tmp-summary-*.txt (task finish artifacts)
 *   - tmp-*.txt (general tmp files)
 *   - .ai/tmp-changed-*.json
 *   - .ai/tmp-summary-*.txt
 *   - .ai/tmp-bridge-poll.json
 *
 * Usage:
 *   node tools/site-config/cleanup-tmp.mjs <site-root> [--dry-run] [--retention-days <n>]
 */

import { readdirSync, statSync, unlinkSync, existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';

const DEFAULT_RETENTION_DAYS = 7;

const TMP_PATTERNS = [
  { dir: '.', pattern: /^tmp-changed-.*\.json$/ },
  { dir: '.', pattern: /^tmp-summary-.*\.txt$/ },
  { dir: '.', pattern: /^tmp-.*\.txt$/ },
  { dir: '.ai', pattern: /^tmp-changed-.*\.json$/ },
  { dir: '.ai', pattern: /^tmp-summary-.*\.txt$/ },
  { dir: '.ai', pattern: /^tmp-bridge-poll\.json$/ },
];

function parseArgs(argv) {
  const args = { dryRun: false, retentionDays: DEFAULT_RETENTION_DAYS };
  const positional = [];
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') { args.dryRun = true; continue; }
    if (arg === '--retention-days') {
      args.retentionDays = parseInt(argv[i + 1], 10);
      i++;
      continue;
    }
    if (!arg.startsWith('--')) { positional.push(arg); }
  }
  return { args, positional };
}

function findTmpFiles(siteRoot, retentionMs) {
  const results = [];
  const now = Date.now();

  for (const { dir, pattern } of TMP_PATTERNS) {
    const fullDir = join(siteRoot, dir);
    if (!existsSync(fullDir)) continue;

    let entries;
    try {
      entries = readdirSync(fullDir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!pattern.test(entry)) continue;
      const fullPath = join(fullDir, entry);
      try {
        const stats = statSync(fullPath);
        const ageMs = now - stats.mtime.getTime();
        if (ageMs > retentionMs) {
          results.push({ path: fullPath, name: entry, ageDays: Math.floor(ageMs / 86400000) });
        }
      } catch {
        // ignore stat errors
      }
    }
  }

  return results;
}

function main() {
  const { args, positional } = parseArgs(process.argv);
  const siteRoot = resolve(positional[0] || process.cwd());
  const retentionMs = args.retentionDays * 24 * 60 * 60 * 1000;

  const files = findTmpFiles(siteRoot, retentionMs);
  const removed = [];
  const errors = [];

  for (const file of files) {
    if (args.dryRun) {
      removed.push(file);
      continue;
    }
    try {
      unlinkSync(file.path);
      removed.push(file);
    } catch (err) {
      errors.push({ path: file.path, error: err.message });
    }
  }

  const result = {
    schema: 'narada.site.cleanup_tmp.v0',
    site_root: siteRoot,
    dry_run: args.dryRun,
    retention_days: args.retentionDays,
    files_found: files.length,
    files_removed: removed.length,
    errors: errors.length,
    removed: removed.map((f) => ({ path: f.path, age_days: f.ageDays })),
    error_details: errors,
  };

  console.log(JSON.stringify(result, null, 2));
  process.exit(errors.length > 0 && !args.dryRun ? 1 : 0);
}

export { findTmpFiles };

const isMain = process.argv[1] && import.meta.url.includes(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  main();
}
