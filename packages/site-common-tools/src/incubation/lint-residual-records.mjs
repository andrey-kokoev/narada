#!/usr/bin/env node
/**
 * lint-residual-records.mjs
 *
 * Conceptual guardrail: validates that residual_records.payload_json entries
 * are auditable and resolvable, not compressed tokens.
 *
 * Hard lint failures:
 *   - missing source_ref
 *   - missing expected_next_boundary
 *
 * Soft warnings:
 *   - missing pressure
 *   - missing owner_or_decision_needed
 *   - label is token-like and no human-readable description exists
 *
 * Usage:
 *   node tools/incubation/lint-residual-records.mjs [path/to/agent-context.sqlite]
 *
 * Default DB path: .ai/state/agent-context.sqlite (relative to project root)
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

let Database;
try {
  const bs3 = await import('better-sqlite3');
  Database = bs3.default;
} catch (error) {
  console.error('[FAIL] better-sqlite3 is not installed. Run: npm install');
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..', '..');
const DEFAULT_DB_PATH = join(rootDir, '.ai', 'state', 'agent-context.sqlite');

const dbPath = process.argv[2] ?? DEFAULT_DB_PATH;

function isTokenLike(label) {
  if (typeof label !== 'string') return false;
  // Token-like: no spaces, contains underscores or is camelCase/PascalCase
  if (label.includes(' ')) return false;
  if (label.includes('_')) return true;
  if (/^[a-z][a-zA-Z0-9]*[A-Z]/.test(label)) return true; // camelCase
  if (/^[A-Z][a-zA-Z0-9]*[a-z][A-Z]/.test(label)) return true; // PascalCase
  if (label.length > 20 && /^[a-z]+$/.test(label)) return true; // long run-on lowercase
  return false;
}

function hasHumanReadableDescription(payload) {
  if (!payload || typeof payload !== 'object') return false;
  const desc = payload.description;
  if (typeof desc !== 'string') return false;
  if (desc.trim().length < 10) return false;
  return true;
}

function lintResidual(row) {
  const { residual_id, label, payload_json, status, event_id, materialization_id } = row;
  const findings = [];
  let payload = null;

  try {
    payload = JSON.parse(payload_json);
  } catch (error) {
    findings.push({
      level: 'HARD',
      residual_id,
      message: `payload_json is not valid JSON: ${error.message}`,
    });
    return findings;
  }

  // Hard: missing source_ref
  if (!payload.source_ref || typeof payload.source_ref !== 'object') {
    findings.push({
      level: 'HARD',
      residual_id,
      message: 'missing source_ref',
    });
  } else {
    const sr = payload.source_ref;
    if (!sr.kind || typeof sr.id !== 'string' || sr.id.trim().length === 0) {
      findings.push({
        level: 'HARD',
        residual_id,
        message: 'source_ref exists but is incomplete (needs kind and non-empty id)',
      });
    }
  }

  // Hard: missing expected_next_boundary
  if (!payload.expected_next_boundary || typeof payload.expected_next_boundary !== 'object') {
    findings.push({
      level: 'HARD',
      residual_id,
      message: 'missing expected_next_boundary',
    });
  } else {
    const enb = payload.expected_next_boundary;
    if (!enb.kind || typeof enb.description !== 'string' || enb.description.trim().length === 0) {
      findings.push({
        level: 'HARD',
        residual_id,
        message: 'expected_next_boundary exists but is incomplete (needs kind and non-empty description)',
      });
    }
  }

  // Soft: missing pressure
  if (!payload.pressure || typeof payload.pressure !== 'object') {
    findings.push({
      level: 'SOFT',
      residual_id,
      message: 'missing pressure',
    });
  }

  // Soft: missing owner_or_decision_needed
  if (!payload.owner_or_decision_needed || typeof payload.owner_or_decision_needed !== 'object') {
    findings.push({
      level: 'SOFT',
      residual_id,
      message: 'missing owner_or_decision_needed',
    });
  }

  // Soft: label is token-like and no human-readable description exists
  if (isTokenLike(label) && !hasHumanReadableDescription(payload)) {
    findings.push({
      level: 'SOFT',
      residual_id,
      message: 'label is token-like and no human-readable description exists',
    });
  }

  return findings;
}

function main() {
  let db;
  try {
    db = new Database(dbPath);
  } catch (error) {
    console.error(`[FAIL] Cannot open database at ${dbPath}: ${error.message}`);
    process.exit(1);
  }

  const rows = db.prepare('SELECT residual_id, label, payload_json, status, event_id, materialization_id FROM residual_records').all();

  let hardCount = 0;
  let softCount = 0;
  let cleanCount = 0;

  for (const row of rows) {
    const findings = lintResidual(row);
    if (findings.length === 0) {
      cleanCount++;
      console.log(`[PASS] ${row.residual_id}: OK`);
      continue;
    }

    for (const f of findings) {
      if (f.level === 'HARD') {
        hardCount++;
        console.log(`[HARD] ${f.residual_id}: ${f.message}`);
      } else {
        softCount++;
        console.log(`[SOFT] ${f.residual_id}: ${f.message}`);
      }
    }
  }

  console.log('\n---');
  console.log(`Total residuals inspected: ${rows.length}`);
  console.log(`Clean: ${cleanCount}, Hard failures: ${hardCount}, Soft warnings: ${softCount}`);

  if (hardCount > 0) {
    console.log('\nHard failures detected. Residuals are not auditable/resolvable.');
    process.exit(1);
  }

  process.exit(0);
}

main();
