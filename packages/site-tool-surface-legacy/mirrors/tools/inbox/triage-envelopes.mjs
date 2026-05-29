#!/usr/bin/env node
/**
 * triage-envelopes.mjs
 *
 * Inbox triage pipeline: classify, deduplicate, route, and report on
 * accumulated envelopes.
 *
 * Usage:
 *   node tools/inbox/triage-envelopes.mjs [<site-root>] [--status received|promoted|acknowledged|all] [--oldest <n>] [--output <path>] [--batch-recommend]
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openTaskLifecycleStore } from '../task-lifecycle/vendor/task-governance/dist/task-lifecycle-store.js';
import {
  classifyEnvelope,
  determineAction,
  determineTargetRole,
  findDuplicateInTitleIndex,
  findDuplicateTaskRows,
  normalizeTitle,
} from './inbox-policy.mjs';

export function parseArgs(argv) {
  const args = { oldest: 20, output: null, siteRoot: process.cwd(), statusFilter: 'received', batchRecommend: false };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--oldest') args.oldest = parseInt(argv[++i], 10);
    else if (arg === '--output') args.output = argv[++i];
    else if (arg === '--status') args.statusFilter = argv[++i];
    else if (arg === '--batch-recommend') args.batchRecommend = true;
    else if (!arg.startsWith('--')) args.siteRoot = resolve(arg);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const inboxDir = join(args.siteRoot, '.ai', 'inbox-envelopes');

  if (!existsSync(inboxDir)) {
    console.error(JSON.stringify({ status: 'error', error: 'inbox_dir_not_found', path: inboxDir }));
    process.exit(1);
  }

  // Load task titles for duplicate detection
  let taskRows = [];
  try {
    const store = openTaskLifecycleStore(args.siteRoot);
    try {
      taskRows = store.db.prepare('SELECT task_id, task_number, title, context_markdown FROM task_specs').all();
    } finally {
      store.db.close();
    }
  } catch {
    // Continue without duplicate detection if DB unavailable
  }

  const files = readdirSync(inboxDir).filter(f => f.endsWith('.json'));
  const envelopes = [];

  for (const file of files) {
    try {
      const raw = readFileSync(join(inboxDir, file), 'utf8');
      const envelope = JSON.parse(raw);
      envelopes.push({ file, ...envelope });
    } catch {
      envelopes.push({ file, parse_error: true, kind: 'unknown', status: 'received', received_at: null });
    }
  }

  // Filter by status
  const filtered = args.statusFilter === 'all'
    ? envelopes
    : envelopes.filter(e => (e.status ?? 'received') === args.statusFilter);

  // Sort by received_at ascending (oldest first)
  filtered.sort((a, b) => {
    const ta = a.received_at ? new Date(a.received_at).getTime() : 0;
    const tb = b.received_at ? new Date(b.received_at).getTime() : 0;
    return ta - tb;
  });

  const now = Date.now();
  const processed = [];
  const titleIndex = [];

  for (const envelope of filtered) {
    const title = envelope.payload?.title ?? envelope.title ?? '';
    const summary = envelope.payload?.summary ?? '';
    const { categories, recommendation } = classifyEnvelope(envelope);
    const targetRole = determineTargetRole(envelope, categories);
    const ageHours = envelope.received_at ? Math.round((now - new Date(envelope.received_at).getTime()) / 3600000) : -1;

    // Duplicate detection
    let duplicateInfo = findDuplicateInTitleIndex(titleIndex, title);
    const normTitle = normalizeTitle(title);
    if (!duplicateInfo.isDuplicate) {
      const taskDuplicate = findDuplicateTaskRows(taskRows, envelope);
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

    const action = determineAction(envelope, categories, recommendation, ageHours, duplicateInfo);

    const record = {
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
  const byKind = {};
  const byRole = {};
  const byAction = {};
  const byCategory = {};

  for (const e of processed) {
    byKind[e.kind] = (byKind[e.kind] || 0) + 1;
    byRole[e.target_role] = (byRole[e.target_role] || 0) + 1;
    byAction[e.recommended_action] = (byAction[e.recommended_action] || 0) + 1;
    for (const cat of e.categories) {
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    }
  }

  const oldest = processed.slice(0, args.oldest);

  // Batch recommendations
  const batchRecommendations = [];
  if (args.batchRecommend) {
    const actionGroups = {};
    for (const e of processed) {
      const key = e.recommended_action;
      if (!actionGroups[key]) actionGroups[key] = [];
      actionGroups[key].push(e);
    }
    for (const [action, items] of Object.entries(actionGroups)) {
      if (items.length >= 3) {
        batchRecommendations.push({
          action,
          count: items.length,
          sample_titles: items.slice(0, 3).map(i => i.title),
          envelope_ids: items.map(i => i.envelope_id),
        });
      }
    }
  }

  const report = {
    schema: 'narada.inbox.triage.v1',
    generated_at: new Date().toISOString(),
    site_root: args.siteRoot,
    status_filter: args.statusFilter,
    total_envelopes: processed.length,
    parse_errors: processed.filter(e => e.kind === 'unknown' && !e.envelope_id).length,
    duplicates_detected: processed.filter(e => e.duplicate_info).length,
    by_kind: byKind,
    by_target_role: byRole,
    by_action: byAction,
    by_category: byCategory,
    batch_recommendations: batchRecommendations,
    oldest: oldest.map(e => ({
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

  const output = JSON.stringify(report, null, 2);
  if (args.output) {
    import('node:fs').then(({ writeFileSync }) => {
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
