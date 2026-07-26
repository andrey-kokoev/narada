#!/usr/bin/env node
/**
 * cleanup-tmp.ts
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
 *   node tools/site-config/cleanup-tmp.ts <site-root> [--dry-run] [--retention-days <n>]
 */

import { readdirSync, statSync, unlinkSync, existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';

const DEFAULT_RETENTION_DAYS: any = 7;

const TMP_PATTERNS: any = [
  { dir: '.', pattern: /^tmp-changed-.*\.json$/ },
  { dir: '.', pattern: /^tmp-summary-.*\.txt$/ },
  { dir: '.', pattern: /^tmp-.*\.txt$/ },
  { dir: '.ai', pattern: /^tmp-changed-.*\.json$/ },
  { dir: '.ai', pattern: /^tmp-summary-.*\.txt$/ },
  { dir: '.ai', pattern: /^tmp-bridge-poll\.json$/ },
];

function parseArgs(argv: any) : any{
  const args: any = { dryRun: false, retentionDays: DEFAULT_RETENTION_DAYS };
  const positional: any = [];
  for (let i = 2; i < argv.length; i++) {
    const arg: any = argv[i];
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

function findTmpFiles(siteRoot: any, retentionMs: any) : any{
  const results: any = [];
  const now: any = Date.now();

  for (const { dir, pattern } of TMP_PATTERNS) {
    const fullDir: any = join(siteRoot, dir);
    if (!existsSync(fullDir)) continue;

    let entries: any;
    try {
      entries = readdirSync(fullDir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!pattern.test(entry)) continue;
      const fullPath: any = join(fullDir, entry);
      try {
        const stats: any = statSync(fullPath);
        const ageMs: any = now - stats.mtime.getTime();
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

function main() : any{
  const { args, positional }: any = parseArgs(process.argv);
  const siteRoot: any = resolve(positional[0] || process.cwd());
  const retentionMs: any = args.retentionDays * 24 * 60 * 60 * 1000;

  const files: any = findTmpFiles(siteRoot, retentionMs);
  const removed: any = [];
  const errors: any = [];

  for (const file of files) {
    if (args.dryRun) {
      removed.push(file);
      continue;
    }
    try {
      unlinkSync(file.path);
      removed.push(file);
    } catch (err: any) {
      errors.push({ path: file.path, error: err.message });
    }
  }

  const result: any = {
    schema: 'narada.site.cleanup_tmp.v0',
    site_root: siteRoot,
    dry_run: args.dryRun,
    retention_days: args.retentionDays,
    files_found: files.length,
    files_removed: removed.length,
    errors: errors.length,
    removed: removed.map((f: any) => ({ path: f.path, age_days: f.ageDays })),
    error_details: errors,
  };

  console.log(JSON.stringify(result, null, 2));
  process.exit(errors.length > 0 && !args.dryRun ? 1 : 0);
}

export { findTmpFiles };

const isMain: any = process.argv[1] && import.meta.url.includes(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  main();
}
