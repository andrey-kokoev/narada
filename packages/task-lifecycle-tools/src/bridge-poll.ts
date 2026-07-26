#!/usr/bin/env node
/**
 * Bridge Poll CLI
 *
 * Runs the inbox-to-task-lifecycle bridge poll and reports results.
 *
 * Usage:
 *   node bridge-poll.ts <cwd> [--dry-run] [--threshold <n>] [--limit <n>]
 */
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { pollInboxBridge } from './inbox-bridge.js';

const cwd: any = process.argv[2] || process.cwd();

function parseArgs(argv: any) : any {
  const args: any = {};
  for (let i = 3; i < argv.length; i++) {
    const arg: any = argv[i];
    if (arg.startsWith('--')) {
      const key: any = arg.replace(/^--/, '').replace(/-/g, '_');
      const next: any = argv[i + 1];
      if (next && !next.startsWith('--')) {
        if (key === 'threshold' || key === 'limit') {
          args[key] = Number(next);
        } else {
          args[key] = next;
        }
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

const args: any = parseArgs(process.argv);

let exitCode: any = 0;
MAIN: try {
  const result: any = await pollInboxBridge(cwd, {
    dryRun: args.dry_run === true,
    threshold: args.threshold,
    limit: args.limit,
  });

  if (result.status === 'error') {
    const errorPayload: any = { status: 'error', error: result.error };
    if (args.output_file) { writeFileSync(args.output_file, JSON.stringify(errorPayload, null, 2), 'utf8'); }
    else { console.error(JSON.stringify(errorPayload, null, 2)); }
    exitCode = 1;
    break MAIN;
  }

  const payload: any = {
    schema: 'narada.bridge.poll.v0',
    status: 'ok',
    cwd: resolve(cwd),
    dry_run: args.dry_run === true,
    threshold: args.threshold ?? 50,
    evaluated: result.evaluated,
    materialized: result.materialized,
    skipped: result.skipped,
    duplicates: result.duplicates,
    errors: result.errors,
    details: result.details,
  };
  if (args.output_file) { writeFileSync(args.output_file, JSON.stringify(payload, null, 2), 'utf8'); }
  else { console.log(JSON.stringify(payload, null, 2)); }
} catch (err: any) {
  const errorPayload: any = {
    status: 'error',
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  };
  if (args.output_file) { writeFileSync(args.output_file, JSON.stringify(errorPayload, null, 2), 'utf8'); }
  else { console.error(JSON.stringify(errorPayload, null, 2)); }
  exitCode = 1;
}

process.exit(exitCode);
