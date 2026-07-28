#!/usr/bin/env node
/**
 * triage-envelopes.ts
 *
 * Inbox triage pipeline: classify, deduplicate, route, and report on
 * accumulated envelopes.
 *
 * Usage:
 *   node tools/inbox/triage-envelopes.ts [<site-root>] [--status received|promoted|acknowledged|all] [--oldest <n>] [--output <path>] [--batch-recommend]
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openTaskLifecycleStore } from '@narada2/task-governance-core/task-lifecycle-store';
import {
  classifyEnvelope,
  determineAction,
  determineTargetRole,
  findDuplicateInTitleIndex,
  findDuplicateTaskRows,
  normalizeTitle,
} from './inbox-policy.js';

export function parseArgs(argv: any) : any{
  const args: any = { oldest: 20, output: null, siteRoot: process.cwd(), statusFilter: 'received', batchRecommend: false };
  for (let i = 2; i < argv.length; i++) {
    const arg: any = argv[i];
    if (arg === '--oldest') args.oldest = parseInt(argv[++i], 10);
    else if (arg === '--output') args.output = argv[++i];
    else if (arg === '--status') args.statusFilter = argv[++i];
    else if (arg === '--batch-recommend') args.batchRecommend = true;
    else if (!arg.startsWith('--')) args.siteRoot = resolve(arg);
  }
  return args;
}

function main() : any{
  const args: any = parseArgs(process.argv);
  const inboxDir: any = join(args.siteRoot, '.ai', 'inbox-envelopes');

  if (!existsSync(inboxDir)) {
    console.error(JSON.stringify({ status: 'error', error: 'inbox_dir_not_found', path: inboxDir }));
    process.exit(1);
  }

  // Load task titles for duplicate detection
  let taskRows: any = [];
  try {
    const store: any = openTaskLifecycleStore(args.siteRoot);
    try {
      taskRows = store.db.prepare('SELECT task_id, task_number, title, context_markdown FROM task_specs').all();
    } finally {
      store.db.close();
    }
  } catch {
    // Continue without duplicate detection if DB unavailable
  }

  const files: any = readdirSync(inboxDir).filter((f: any) => f.endsWith('.json'));
  const envelopes: any = [];

  for (const file of files) {
    try {
      const raw: any = readFileSync(join(inboxDir, file), 'utf8');
      const envelope: any = JSON.parse(raw);
      envelopes.push({ file, ...envelope });
    } catch {
      envelopes.push({ file, parse_error: true, kind: 'unknown', status: 'received', received_at: null });
    }
  }

  // Filter by status
  const filtered: any = args.statusFilter === 'all'
    ? envelopes
    : envelopes.filter((e: any) => (e.status ?? 'received') === args.statusFilter);

  // Sort by received_at ascending (oldest first)
  filtered.sort((a: any, b: any) => {
    const ta: any = a.received_at ? new Date(a.received_at).getTime() : 0;
    const tb: any = b.received_at ? new Date(b.received_at).getTime() : 0;
    return ta - tb;
  });

  const now: any = Date.now();
  const processed: any = [];
  const titleIndex: any = [];

  for (const envelope of filtered) {
    const title: any = envelope.payload?.title ?? envelope.title ?? '';
    const summary: any = envelope.payload?.summary ?? '';
    const { categories, recommendation }: any = classifyEnvelope(envelope);
    const targetRole: any = determineTargetRole(envelope, categories);
    const ageHours: any = envelope.received_at ? Math.round((now - new Date(envelope.received_at).getTime()) / 3600000) : -1;

    // Duplicate detection
    let duplicateInfo: any = findDuplicateInTitleIndex(titleIndex, title);
    const normTitle: any = normalizeTitle(title);
    if (!duplicateInfo.isDuplicate) {
      const taskDuplicate: any = findDuplicateTaskRows(taskRows, envelope);
      if (taskDuplicate.isDuplicate) {
        duplicateInfo = {
          isDuplicate: true,
          duplicateOf: taskDuplicate.duplicateOf,
          matchType: taskDuplicate.matchType === 'title_similarity' ? 'task_title_similarity' : taskDuplicate.matchType,
          distance: taskDuplicate.distance,
          normalized: taskDuplicate.normalized,
        };
      }
    }

    const action: any = determineAction(envelope, categories, recommendation, ageHours, duplicateInfo);

    const record: any = {
      file: envelope.file,
      envelope_id: envelope.envelope_id ?? null,
      received_at: envelope.received_at ?? null,
      age_hours: ageHours,
      kind: envelope.kind ?? 'unknown',
      status: envelope.status ?? 'received',
      title: title.slice(0, 200),
      summary: summary.slice(0, 300),
      categories,
      target_role: targetRole,
      recommended_action: action,
      duplicate_info: duplicateInfo.isDuplicate ? duplicateInfo : null,
      principal: envelope.authority?.principal ?? null,
      source_ref: envelope.source?.ref ?? null,
    };

    processed.push(record);
    titleIndex.push({ normTitle, envelopeId: record.envelope_id });
  }

  // Summaries
  const byKind: any = {};
  const byRole: any = {};
  const byAction: any = {};
  const byCategory: any = {};

  for (const e of processed) {
    byKind[e.kind] = (byKind[e.kind] || 0) + 1;
    byRole[e.target_role] = (byRole[e.target_role] || 0) + 1;
    byAction[e.recommended_action] = (byAction[e.recommended_action] || 0) + 1;
    for (const cat of e.categories) {
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    }
  }

  const oldest: any = processed.slice(0, args.oldest);

  // Batch recommendations
  const batchRecommendations: any = [];
  if (args.batchRecommend) {
    const actionGroups: any = {};
    for (const e of processed) {
      const key: any = e.recommended_action;
      if (!actionGroups[key]) actionGroups[key] = [];
      actionGroups[key].push(e);
    }
    for (const [action, items] of Object.entries(actionGroups) as Array<[string, any[]]>) {
      if (items.length >= 3) {
        batchRecommendations.push({
          action,
          count: items.length,
          sample_titles: items.slice(0, 3).map((i: any) => i.title),
          envelope_ids: items.map((i: any) => i.envelope_id),
        });
      }
    }
  }

  const report: any = {
    schema: 'narada.inbox.triage.v1',
    generated_at: new Date().toISOString(),
    site_root: args.siteRoot,
    status_filter: args.statusFilter,
    total_envelopes: processed.length,
    parse_errors: processed.filter((e: any) => e.kind === 'unknown' && !e.envelope_id).length,
    duplicates_detected: processed.filter((e: any) => e.duplicate_info).length,
    by_kind: byKind,
    by_target_role: byRole,
    by_action: byAction,
    by_category: byCategory,
    batch_recommendations: batchRecommendations,
    oldest: oldest.map((e: any) => ({
      file: e.file,
      envelope_id: e.envelope_id,
      received_at: e.received_at,
      age_hours: e.age_hours,
      kind: e.kind,
      title: e.title,
      categories: e.categories,
      target_role: e.target_role,
      recommended_action: e.recommended_action,
      duplicate_of: e.duplicate_info?.duplicateOf ?? null,
    })),
  };

  const output: any = JSON.stringify(report, null, 2);
  if (args.output) {
    import('node:fs').then(({ writeFileSync }: any) => {
      writeFileSync(args.output, output, 'utf8');
      console.log(`Report written to ${args.output}`);
    });
  } else {
    console.log(output);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
