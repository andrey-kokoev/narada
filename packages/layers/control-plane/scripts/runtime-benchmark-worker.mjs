#!/usr/bin/env node

import Database from '@narada-core/sqlite';
import { hashNormalizedPayload, normalizeBatch } from '../dist/index.js';
import { performance } from 'node:perf_hooks';

const argv = process.argv.slice(2);

if (!argv.includes('--worker')) {
  console.error('runtime-benchmark-worker is an internal worker; run scripts/benchmark-runtime-comparison.mjs');
  process.exit(2);
}

function option(name, fallback) {
  const index = argv.indexOf(name);
  if (index < 0) return fallback;
  const value = Number(argv[index + 1]);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

const warmupRuns = option('--warmup', 5);
const measurementRuns = option('--samples', 12);
const runtime = {
  id: process.versions.bun ? 'bun' : 'node',
  version: process.versions.bun ?? process.versions.node,
  node_version: process.versions.node,
  bun_version: process.versions.bun ?? null,
  executable: process.execPath,
};

const message = {
  id: 'AQMkADAwATM0MDAAMS0xMzUALTA0MjAARgAAA',
  createdDateTime: '2024-01-15T10:30:00Z',
  receivedDateTime: '2024-01-15T10:30:00Z',
  subject: 'Benchmark message',
  bodyPreview: 'A deterministic benchmark payload.',
  isRead: false,
  from: { emailAddress: { name: 'Benchmark Sender', address: 'sender@example.test' } },
  toRecipients: [{ emailAddress: { name: 'Benchmark Receiver', address: 'receiver@example.test' } }],
};

const messages = Array.from({ length: 100 }, (_, index) => ({
  ...message,
  id: `benchmark-${index}`,
}));

const normalizeOptions = {
  mailbox_id: 'benchmark@example.test',
  adapter_scope: {
    mailbox_id: 'benchmark@example.test',
    included_container_refs: ['inbox'],
    included_item_kinds: ['message'],
    attachment_policy: 'metadata_only',
    body_policy: 'text_only',
  },
  next_cursor: 'benchmark-cursor',
  fetched_at: '2026-01-01T00:00:00Z',
  has_more: false,
  body_policy: 'text_only',
  attachment_policy: 'metadata_only',
  include_headers: false,
  normalize_folder_ref: () => ['inbox'],
  normalize_flagged: () => false,
};

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

function summarize(values) {
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const variance = values.reduce((total, value) => total + ((value - mean) ** 2), 0) / values.length;
  return {
    runs: values.length,
    mean_ms: mean,
    median_ms: percentile(values, 0.5),
    p95_ms: percentile(values, 0.95),
    p99_ms: percentile(values, 0.99),
    stddev_ms: Math.sqrt(variance),
    min_ms: Math.min(...values),
    max_ms: Math.max(...values),
    ops_per_second: 1000 / mean,
  };
}

async function measure(name, description, operation) {
  for (let index = 0; index < warmupRuns; index += 1) await operation();
  const samples = [];
  for (let index = 0; index < measurementRuns; index += 1) {
    const started = performance.now();
    await operation();
    samples.push(performance.now() - started);
  }
  return {
    name,
    description,
    samples_ms: samples,
    ...summarize(samples),
  };
}

function createWriteReadDatabase() {
  const database = new Database(':memory:');
  database.exec('CREATE TABLE records (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
  return database;
}

function createReadDatabase() {
  const database = new Database(':memory:');
  database.exec('CREATE TABLE records (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
  const insert = database.prepare('INSERT INTO records (id, value) VALUES (?, ?)');
  database.exec('BEGIN');
  for (let index = 0; index < 500; index += 1) insert.run(index, `value-${index}`);
  database.exec('COMMIT');
  return database;
}

async function main() {
  const results = [];
  const writeReadDatabase = createWriteReadDatabase();
  const write = writeReadDatabase.prepare('INSERT INTO records (id, value) VALUES (?, ?)');
  const read = writeReadDatabase.prepare('SELECT value FROM records WHERE id = ?');
  try {
    results.push(await measure(
      'sqlite-write-read-500',
      'Insert 500 rows in one transaction, then read all 500 rows.',
      () => {
        writeReadDatabase.exec('DELETE FROM records');
        writeReadDatabase.exec('BEGIN');
        try {
          for (let index = 0; index < 500; index += 1) write.run(index, `value-${index}`);
          writeReadDatabase.exec('COMMIT');
        } catch (error) {
          writeReadDatabase.exec('ROLLBACK');
          throw error;
        }
        let checksum = 0;
        for (let index = 0; index < 500; index += 1) {
          if (read.get(index)?.value === `value-${index}`) checksum += 1;
        }
        if (checksum !== 500) throw new Error(`sqlite benchmark checksum mismatch: ${checksum}`);
      },
    ));
  } finally {
    writeReadDatabase.close();
  }

  const readDatabase = createReadDatabase();
  const readStatement = readDatabase.prepare('SELECT value FROM records WHERE id = ?');
  try {
    results.push(await measure(
      'sqlite-read-500',
      'Read 500 prepared-statement rows from an in-memory database.',
      () => {
        let checksum = 0;
        for (let index = 0; index < 500; index += 1) {
          if (readStatement.get(index)?.value === `value-${index}`) checksum += 1;
        }
        if (checksum !== 500) throw new Error(`sqlite read checksum mismatch: ${checksum}`);
      },
    ));
  } finally {
    readDatabase.close();
  }

  results.push(await measure(
    'control-plane-normalize-batch-100',
    'Normalize the same 100-message Graph-shaped batch.',
    () => {
      const normalized = normalizeBatch({ ...normalizeOptions, messages });
      if (normalized.events.length !== 100) throw new Error(`normalize benchmark count mismatch: ${normalized.events.length}`);
    },
  ));

  const hashPayload = {
    id: 'benchmark-event',
    received_at: '2024-01-15T10:30:00Z',
    subject: 'Benchmark event',
    content: 'x'.repeat(2048),
    metadata: { source: 'runtime-comparison', nested: { stable: true } },
  };
  results.push(await measure(
    'control-plane-hash-10000',
    'Build 10,000 deterministic content hashes.',
    () => {
      let last = '';
      for (let index = 0; index < 10_000; index += 1) last = hashNormalizedPayload(hashPayload);
      if (!last) throw new Error('hash benchmark returned an empty hash');
    },
  ));

  process.stdout.write(JSON.stringify({
    schema: 'narada.runtime_benchmark.worker.v1',
    runtime,
    options: { warmup_runs: warmupRuns, measurement_runs: measurementRuns },
    results,
  }) + '\n');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
