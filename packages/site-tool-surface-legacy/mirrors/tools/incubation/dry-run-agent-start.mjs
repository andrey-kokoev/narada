#!/usr/bin/env node
/**
 * dry-run-agent-start.mjs
 *
 * Smallest writer that proves the schema supports startup ritual
 * without turning Intelligence Context into memory.
 *
 * Usage (dry-run, default):
 *   node tools/incubation/dry-run-agent-start.mjs --identity narada-andrey.architect --runtime kimi
 *
 * Usage (write):
 *   node tools/incubation/dry-run-agent-start.mjs --identity narada-andrey.architect --runtime kimi --write
 */

import Database from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..', '..');
const MIGRATION_PATH = join(rootDir, '.ai', 'db', 'migrations', '001-agent-context-materializations.sql');

const args = parseArgs(process.argv.slice(2));

const identity = stringArg(args, 'identity');
const runtime = stringArg(args, 'runtime');
const dbPath = stringArg(args, 'db') ?? join(rootDir, '.ai', 'state', 'agent-context.sqlite');
const dryRun = !booleanArg(args, 'write');

if (!identity || !runtime) {
  process.stderr.write('Usage: node dry-run-agent-start.mjs --identity <id> --runtime <rt> [--db <path>] [--write]\n');
  process.exit(1);
}

const now = new Date().toISOString();
const eventId = `evt-${now.replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)}_${randomUUID().slice(0, 8)}`;
const materializationId = `mat-${randomUUID().slice(0, 8)}`;
const ecMaterializationId = `ec-${randomUUID().slice(0, 8)}`;
const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour ephemeral

const resumeCommand = `${runtime} -r ${identity}`;

const executionContextPayload = {
  runtime,
  cwd: process.cwd(),
  mcp_servers: [
    { name: 'narada-andrey-operator-surface', transport: 'stdio' },
    { name: 'narada-andrey-task-lifecycle', transport: 'stdio' },
    { name: 'narada-andrey-inbox', transport: 'stdio' },
  ],
  available_tools: ['shell', 'read_file', 'write_file', 'grep', 'agent'],
  transport: 'stdio',
};

const intelligenceContextPayload = {
  $schema: 'narada/schemas/intelligence_context.v0.schema.json',
  materialized_context: {
    facts: [
      { claim: 'Agent start initiated', source: 'dry_run_script', authority: 'high', volatility: 'low', provenance: 'observed_present' },
    ],
    observations: [],
    session_residue: [],
    source_provenance: [
      { source: 'system_prompt', authority: 'absolute', volatility: 'none' },
      { source: 'dry_run_script', authority: 'high', volatility: 'low' },
    ],
  },
  work_frame: {
    principal_intent_as_understood: 'Start agent session and materialize ephemeral context.',
    active_question: null,
    known_constraints: ['Do not persist intelligence context as memory', 'expires_at must be set'],
    open_arbitrariness: [],
    residuals_seen: [],
  },
  arbitrariness_partition: {
    forced_structure: ['bounded materialization', 'provenance', 'authority posture', 'evaluation output', 'residuals'],
    contingent_policy: ['exact field names', 'retention duration', 'display format'],
    decision_inert: ['anthropomorphic mind metaphors', 'runtime branding'],
    residual: [],
  },
  evaluation_state: {
    candidate_distinctions: [],
    candidate_hypotheses: [],
    candidate_next_moves: [],
    confidence_annotations: [],
    collapse_risks: [],
  },
  coherence_diagnosis: {
    semantic_resolution: 'Intelligence Context is the bounded evaluation interior.',
    invariant_preservation: 'IAS invariant preserved.',
    constructive_executability: 'Schema supports ephemeral materialization.',
    grounded_universalization: 'Tested across Kimi, Codex, mailbox steward.',
    authority_reviewability: 'Status is candidate, not canonical.',
    teleological_pressure: 'Prevent draft-as-intent collapse.',
  },
  proposal_output: {
    recommended_evaluation: 'Agent start materialized successfully.',
    recommended_decision_request: null,
    recommended_intent_request: null,
    recommended_residuals: [],
  },
  residuals: {
    unresolved: [],
    deferred: [],
    dropped: [],
  },
};

const proposalPayload = {
  proposal_type: 'evaluation',
  description: 'Dry-run agent start completed. Intelligence Context materialized as ephemeral trace.',
};

if (dryRun) {
  const plan = {
    mode: 'dry_run',
    db_path: dbPath,
    agent_start_event: {
      event_id: eventId,
      identity_id: identity,
      runtime,
      created_at: now,
      status: 'materialized',
      resume_command: resumeCommand,
      bootstrap_artifact_uri: null,
    },
    execution_context_materialization: {
      materialization_id: ecMaterializationId,
      event_id: eventId,
      runtime,
      payload_json: executionContextPayload,
      created_at: now,
      expires_at: expiresAt,
    },
    intelligence_context_materialization: {
      materialization_id: materializationId,
      event_id: eventId,
      schema_id: 'narada.intelligence_context.v0',
      payload_json: intelligenceContextPayload,
      created_at: now,
      expires_at: expiresAt,
    },
    proposal_records: [
      {
        proposal_id: `prop-${randomUUID().slice(0, 8)}`,
        event_id: eventId,
        materialization_id: materializationId,
        proposal_type: proposalPayload.proposal_type,
        payload_json: proposalPayload,
        verdict: 'pending',
        created_at: now,
      },
    ],
  };

  console.log('=== DRY RUN ===');
  console.log(JSON.stringify(plan, null, 2));
  console.log('\n=== BOOTSTRAP ===');
  console.log(`agent_start_event: ${eventId}`);
  console.log(`resume_command: ${resumeCommand}`);
  console.log(`bootstrap_prompt: Reconstruct Intelligence Context from event ${eventId}...`);
  console.log('\nNo database write performed. Pass --write to persist.');
  process.exit(0);
}

// --write mode
let db;
try {
  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }
  db = new Database(dbPath);
} catch (error) {
  process.stderr.write(`Failed to open DB: ${error.message}\n`);
  process.exit(1);
}

// Apply migration if tables missing
const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'agent_start_events'").get();
if (!hasTable) {
  try {
    const sql = readFileSync(MIGRATION_PATH, 'utf8');
    db.exec(sql);
  } catch (error) {
    process.stderr.write(`Failed to apply migration: ${error.message}\n`);
    process.exit(1);
  }
}

// Guardrail: all intelligence context reads must require event_id or materialization_id
// This script does not read IC by identity alone.
// The only reads here are by explicit event_id or materialization_id for verification.

const insertEvent = db.prepare(`
  INSERT INTO agent_start_events (event_id, identity_id, runtime, created_at, status, resume_command, bootstrap_artifact_uri)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const insertEC = db.prepare(`
  INSERT INTO execution_context_materializations (materialization_id, event_id, runtime, cwd, payload_json, created_at, expires_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const insertIC = db.prepare(`
  INSERT INTO intelligence_context_materializations (materialization_id, event_id, schema_id, payload_json, created_at, expires_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const insertProposal = db.prepare(`
  INSERT INTO proposal_records (proposal_id, event_id, materialization_id, proposal_type, payload_json, verdict, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const proposalId = `prop-${randomUUID().slice(0, 8)}`;

try {
  db.transaction(() => {
    insertEvent.run(eventId, identity, runtime, now, 'materialized', resumeCommand, null);
    insertEC.run(ecMaterializationId, eventId, runtime, process.cwd(), JSON.stringify(executionContextPayload), now, expiresAt);
    insertIC.run(materializationId, eventId, 'narada.intelligence_context.v0', JSON.stringify(intelligenceContextPayload), now, expiresAt);
    insertProposal.run(proposalId, eventId, materializationId, proposalPayload.proposal_type, JSON.stringify(proposalPayload), 'pending', now);
  })();
} catch (error) {
  process.stderr.write(`Transaction failed: ${error.message}\n`);
  process.exit(1);
}

// Verify write by reading back using event_id (guardrail: never by identity alone)
const eventRow = db.prepare(`SELECT event_id, identity_id, runtime, status FROM agent_start_events WHERE event_id = ?`).get(eventId);
const icRow = db.prepare(`SELECT materialization_id, event_id, expires_at FROM intelligence_context_materializations WHERE event_id = ?`).get(eventId);
const proposalRow = db.prepare(`SELECT proposal_id, materialization_id, verdict FROM proposal_records WHERE event_id = ?`).get(eventId);

db.close();

console.log('=== WRITE COMPLETE ===');
console.log(`agent_start_event: ${eventRow.event_id}`);
console.log(`identity: ${eventRow.identity_id}`);
console.log(`runtime: ${eventRow.runtime}`);
console.log(`status: ${eventRow.status}`);
console.log(`intelligence_context_materialization: ${icRow.materialization_id}`);
console.log(`expires_at: ${icRow.expires_at}`);
console.log(`proposal: ${proposalRow.proposal_id} (${proposalRow.verdict})`);
console.log(`\nresume_command: ${resumeCommand}`);
console.log(`\n=== FIRST PROMPT ===`);
console.log(`Use agent_context_show_bootstrap with event_id ${eventId}.`);
console.log(`Then reconstruct execution_context, intelligence_context, authority_state, residuals, and recommend one next action.`);

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        result[key] = argv[i + 1];
        i++;
      } else {
        result[key] = true;
      }
    }
  }
  return result;
}

function stringArg(args, key) {
  const val = args[key];
  return typeof val === 'string' ? val : null;
}

function booleanArg(args, key) {
  return args[key] === true || args[key] === 'true';
}
