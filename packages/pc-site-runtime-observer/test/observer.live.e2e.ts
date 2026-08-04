import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { cpus } from 'node:os';
import test from 'node:test';
import { observerPaths, runObserverCommand } from '../src/main.js';

const enabled = process.env.NARADA_PC_SITE_RUNTIME_OBSERVER_LIVE_E2E === '1';

test('live observer ingests sources, samples itself, and remains evidence-only', { skip: !enabled }, async () => {
  const siteRoot = process.env.NARADA_SITE_ROOT;
  if (!siteRoot) throw new Error('NARADA_SITE_ROOT is required');
  await runObserverCommand('ensure', { site_root: siteRoot });
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const probe = new DatabaseSync(observerPaths(siteRoot).db, { readOnly: true });
    try {
      const count = probe.prepare("SELECT COUNT(*) count FROM process_samples WHERE owner_id='observer-overhead'").get() as { count: number };
      if (Number(count.count) >= 2) break;
    } finally { probe.close(); }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const db = new DatabaseSync(observerPaths(siteRoot).db, { readOnly: true });
  try {
    const observer = db.prepare("SELECT owner_id,pid FROM owners WHERE owner_kind='observer_overhead'").get() as Record<string, unknown>;
    assert.equal(Number(observer.pid) > 0, true);
    const sample = db.prepare("SELECT sampled_at_ms,private_bytes FROM process_samples WHERE owner_id='observer-overhead' ORDER BY sampled_at_ms DESC LIMIT 1").get() as Record<string, unknown>;
    assert.equal(Number(sample.private_bytes) > 0, true);
    assert.equal(Number(sample.private_bytes) <= 25 * 1024 * 1024, true, `observer private bytes ${sample.private_bytes}`);
    const cycle = db.prepare("SELECT * FROM observer_cycles WHERE status='complete' ORDER BY started_at_ms DESC LIMIT 1").get() as Record<string, unknown>;
    assert.equal(Number(cycle.duration_ms) <= 250, true, `observer cycle duration ${cycle.duration_ms}ms`);
    assert.equal(Number(cycle.sampled_processes) > 0, true);
    const cpu = db.prepare("SELECT sampled_at_ms,cpu_time_ms FROM process_samples WHERE owner_id='observer-overhead' ORDER BY sampled_at_ms ASC").all() as Array<Record<string, unknown>>;
    assert.equal(cpu.length >= 2, true);
    const first = cpu[0]!;
    const last = cpu.at(-1)!;
    const averageCpuPercent = (Number(last.cpu_time_ms) - Number(first.cpu_time_ms)) / (Number(last.sampled_at_ms) - Number(first.sampled_at_ms)) * 100 / Math.max(1, cpus().length);
    assert.equal(averageCpuPercent <= 0.5, true, `observer average CPU ${averageCpuPercent}%`);
    const controlTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%restart%' OR name LIKE '%termination%')").all();
    assert.deepEqual(controlTables, []);
  } finally { db.close(); }
});
