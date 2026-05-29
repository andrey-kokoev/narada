#!/usr/bin/env node
/**
 * batch-triage.mjs
 *
 * Execute batch actions on inbox envelopes based on triage recommendations.
 *
 * Usage:
 *   node tools/inbox/batch-triage.mjs <site-root> --action acknowledge|archive|materialize \
 *     [--filter-kind <kind>] [--older-than <hours>] [--limit <n>] [--dry-run]
 *
 * Examples:
 *   node tools/inbox/batch-triage.mjs . --action acknowledge --filter-kind observation --older-than 48 --dry-run
 *   node tools/inbox/batch-triage.mjs . --action archive --older-than 168 --limit 50 --dry-run
 *   node tools/inbox/batch-triage.mjs . --action materialize --filter-kind capa --dry-run
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { appendAdmissionEvent } from '../inbox/admission-log.mjs';
import { evaluateEnvelopeSeverity, checkDuplicateTask, materializeEnvelopeAsTask, markEnvelopeMaterialized } from '../task-lifecycle/inbox-bridge.mjs';

function parseArgs(argv) {
  const args = { action: null, filterKind: null, olderThan: null, limit: Infinity, dryRun: false, siteRoot: process.cwd() };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--action') args.action = argv[++i];
    else if (arg === '--filter-kind') args.filterKind = argv[++i];
    else if (arg === '--older-than') args.olderThan = parseInt(argv[++i], 10);
    else if (arg === '--limit') args.limit = parseInt(argv[++i], 10);
    else if (arg === '--dry-run') args.dryRun = true;
    else if (!arg.startsWith('--')) args.siteRoot = resolve(arg);
  }
  return args;
}

function normalizeTitle(title) {
  return String(title ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    const ai = a[i - 1];
    for (let j = 1; j <= n; j++) {
      const cost = ai === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

function classifyForAction(envelope) {
  const title = normalizeTitle(envelope.payload?.title ?? envelope.title ?? '');
  const summary = normalizeTitle(envelope.payload?.summary ?? '');
  const text = `${title} ${summary}`;
  const kind = envelope.kind ?? 'unknown';
  const recommendation = String(envelope.payload?.recommendation ?? '').toLowerCase();
  const hasCapaRequest = envelope.payload?.capa_request && typeof envelope.payload.capa_request === 'object';

  const categories = [];
  const recurrenceEvidencePattern = /\b(recurrence|recurring|regression|incident|failure|failed|broken|blocked|missing|risk|error|violation|drift|gap|cannot|can't|stale)\b/;
  const keywordMap = {
    review_request: /\breview\b.*\btask\b|\breview\b.*\brequest\b/,
    dogfood_proof: /\bdogfood\b|\bproof\b|\blive proof\b/,
    mcp_gap: /\bmcp gap\b|\bmcp.*missing\b|\bmcp.*lack\b/,
    capa: /\bcapa\b.*\b(recurrence|recurring|regression|incident|failure|failed|broken|blocked|missing|risk|error|violation|drift|gap|cannot|can't|stale)\b|\b(recurrence|recurring|regression|incident|failure|failed|broken|blocked|missing|risk|error|violation|drift|gap|cannot|can't|stale)\b.*\bcapa\b/,
    doctrinal_drift: /\bdoctrinal drift\b|\bdoctrine\b.*\bdrift\b/,
    ergonomics: /\bergonomics\b|\bergonomic\b/,
    operator_surface: /\boperator surface\b|\bkomorebi\b|\byasb\b/,
    git_hygiene: /\bgit\b.*\bdirty\b|\bunpushed\b|\bdivergence\b/,
    inbox_pipeline: /\binbox\b.*\btriage\b|\binbox\b.*\bpipeline\b|\binbox backlog\b/,
    task_lifecycle: /\btask lifecycle\b|\btask governance\b/,
    builder_idle: /\bbuilder idle\b|\bno claimable\b|\bno tasks\b/,
  };

  for (const [cat, pattern] of Object.entries(keywordMap)) {
    if (pattern.test(text)) categories.push(cat);
  }
  if (hasCapaRequest && !categories.includes('capa_request')) categories.push('capa_request');
  if (kind === 'incident' && !categories.includes('incident')) categories.push('incident');
  if (/\brecurrence\b|\brecurring\b/.test(text) && recurrenceEvidencePattern.test(text) && !categories.includes('capa_request')) {
    categories.push('capa_request');
  }

  if (categories.length === 0) {
    if (kind === 'proposal') categories.push('proposal');
    else if (kind === 'incident') categories.push('incident');
    else if (kind === 'command_request') categories.push('command_request');
    else categories.push('general');
  }

  return { categories, recommendation, title };
}

function determineAction(envelope, categories, recommendation, ageHours) {
  const kind = envelope.kind ?? 'unknown';
  const title = normalizeTitle(envelope.payload?.title ?? envelope.title ?? '');

  // Status reports and operational noise
  const statusReportPatterns = /\bbuilder session complete\b|\bbuilder idle\b|\binbox backlog check\b|\bworkboard check\b|\bno tasks available\b|\bno claimable\b|\bchecking for materializable\b/;
  if (statusReportPatterns.test(title)) return 'acknowledge';

  // Explicit recommendation on envelope
  if (recommendation === 'acknowledge') return 'acknowledge';
  if (recommendation === 'dismiss') return 'archive';
  if (recommendation === 'escalate') return 'materialize';

  // Stale review requests and dogfood proofs
  if (categories.includes('review_request') && ageHours > 48) return 'acknowledge';
  if (categories.includes('dogfood_proof') && ageHours > 24) return 'acknowledge';

  // CAPA requests require promotion review; incidents still materialize.
  if (kind === 'incident') return 'materialize';
  if (categories.includes('capa_request')) return 'review_capa_request';
  if (categories.includes('incident')) return 'materialize';

  // Proposals need review
  if (kind === 'proposal') return 'review';

  // Observations with proposals materialize if fresh, else acknowledge
  if (kind === 'observation') {
    const hasProposals = Array.isArray(envelope.payload?.proposal) && envelope.payload.proposal.length > 0;
    if (hasProposals) {
      return ageHours < 72 ? 'materialize' : 'acknowledge';
    }
    if (ageHours > 48) return 'acknowledge';
    return 'triage';
  }

  // Command requests: acknowledge if stale
  if (kind === 'command_request') {
    return ageHours > 72 ? 'acknowledge' : 'materialize';
  }

  if (ageHours > 168) return 'acknowledge';
  return 'triage';
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.action) {
    console.error('Usage: node tools/inbox/batch-triage.mjs <site-root> --action <acknowledge|archive|materialize> [options]');
    process.exit(1);
  }

  const inboxDir = join(args.siteRoot, '.ai', 'inbox-envelopes');
  const archiveDir = join(args.siteRoot, '.ai', 'inbox-archive');

  if (!existsSync(inboxDir)) {
    console.error(JSON.stringify({ status: 'error', error: 'inbox_dir_not_found', path: inboxDir }));
    process.exit(1);
  }

  const files = readdirSync(inboxDir).filter(f => f.endsWith('.json'));
  const envelopes = [];

  for (const file of files) {
    try {
      const raw = readFileSync(join(inboxDir, file), 'utf8');
      const envelope = JSON.parse(raw);
      if ((envelope.status ?? 'received') === 'received') {
        envelopes.push({ file, ...envelope });
      }
    } catch {
      // skip parse errors
    }
  }

  const now = Date.now();
  const candidates = [];

  for (const envelope of envelopes) {
    const { categories, recommendation, title } = classifyForAction(envelope);
    const ageHours = envelope.received_at ? Math.round((now - new Date(envelope.received_at).getTime()) / 3600000) : -1;
    const action = determineAction(envelope, categories, recommendation, ageHours);

    if (args.filterKind && envelope.kind !== args.filterKind) continue;
    if (args.olderThan !== null && (ageHours === -1 || ageHours < args.olderThan)) continue;
    if (action !== args.action && args.action !== 'archive') continue; // archive accepts any action if stale enough

    candidates.push({ envelope, action, ageHours, categories, title });
  }

  // Sort oldest first, limit
  candidates.sort((a, b) => a.ageHours - b.ageHours);
  const selected = candidates.slice(0, args.limit);

  if (selected.length === 0) {
    console.log(JSON.stringify({ status: 'no_candidates', criteria: args }, null, 2));
    return;
  }

  const results = [];

  if (args.dryRun) {
    for (const item of selected) {
      results.push({
        file: item.envelope.file,
        envelope_id: item.envelope.envelope_id,
        title: item.title.slice(0, 120),
        age_hours: item.ageHours,
        action: item.action,
        would_do: args.action,
      });
    }
    console.log(JSON.stringify({ status: 'dry_run', count: results.length, results }, null, 2));
    return;
  }

  // Ensure archive directory exists
  if (args.action === 'archive' && !existsSync(archiveDir)) {
    mkdirSync(archiveDir, { recursive: true });
  }

  for (const item of selected) {
    const envelope = item.envelope;
    const filePath = join(inboxDir, envelope.file);

    try {
      if (args.action === 'acknowledge') {
        // Update envelope status
        const updated = { ...envelope, status: 'acknowledged', acknowledgement: { acknowledged_at: new Date().toISOString(), acknowledged_by: 'batch-triage' } };
        writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf8');

        // Append admission log event
        try {
          appendAdmissionEvent(args.siteRoot, {
            event_kind: 'envelope_acknowledged',
            envelope_id: envelope.envelope_id,
            principal: 'batch-triage',
            authority_level: 'system_generated',
            payload_hash: null,
            payload_uri: null,
            acknowledgement: {
              acknowledged_at: new Date().toISOString(),
              acknowledged_by: 'batch-triage',
              reason: 'batch_acknowledge_stale_backlog',
            },
          });
        } catch (logErr) {
          // Continue even if log append fails
        }

        results.push({ envelope_id: envelope.envelope_id, status: 'acknowledged', file: envelope.file });
      } else if (args.action === 'archive') {
        // Move file to archive
        const destPath = join(archiveDir, envelope.file);
        renameSync(filePath, destPath);

        // Append admission log event
        try {
          appendAdmissionEvent(args.siteRoot, {
            event_kind: 'envelope_archived',
            envelope_id: envelope.envelope_id,
            principal: 'batch-triage',
            authority_level: 'system_generated',
            payload_hash: null,
            payload_uri: null,
            archive: {
              archived_at: new Date().toISOString(),
              archived_by: 'batch-triage',
              reason: 'batch_archive_stale_backlog',
              source_path: filePath,
              dest_path: destPath,
            },
          });
        } catch (logErr) {
          // Continue even if log append fails
        }

        results.push({ envelope_id: envelope.envelope_id, status: 'archived', file: envelope.file });
      } else if (args.action === 'materialize') {
        // Use the inbox bridge to materialize
        try {
          const severityResult = evaluateEnvelopeSeverity(envelope);
          if (severityResult.action !== 'materialize') {
            results.push({ envelope_id: envelope.envelope_id, status: 'skipped', reason: 'not_materializable', severity: severityResult.severity });
            continue;
          }

          const dup = checkDuplicateTask(
            { db: { prepare: () => ({ all: () => [] }) } }, // lightweight store for duplicate check
            envelope
          );

          // Actually materialize
          const result = await materializeEnvelopeAsTask(args.siteRoot, envelope);
          if (result.status === 'materialized') {
            markEnvelopeMaterialized(args.siteRoot, envelope, result.taskNumber, result.taskId);
            results.push({ envelope_id: envelope.envelope_id, status: 'materialized', task_number: result.taskNumber, task_id: result.taskId });
          } else {
            results.push({ envelope_id: envelope.envelope_id, status: 'skipped', reason: result.status });
          }
        } catch (err) {
          results.push({ envelope_id: envelope.envelope_id, status: 'error', error: err.message });
        }
      }
    } catch (err) {
      results.push({ envelope_id: envelope.envelope_id, status: 'error', error: err.message });
    }
  }

  console.log(JSON.stringify({ status: 'completed', action: args.action, count: results.length, results }, null, 2));
}

main().catch(err => {
  console.error(JSON.stringify({ status: 'fatal_error', error: err.message }));
  process.exit(1);
});
