/**
 * Construction loop audit log.
 *
 * Append-only JSON lines for auto-promotion events.
 */

import { mkdir, appendFile, readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';

export interface AutoPromotionAuditRecord {
  timestamp: string;
  promotion_id: string;
  task_id: string;
  task_number: number | null;
  agent_id: string;
  policy_version: number;
  gate_results: Array<{ gate: string; passed: boolean; detail?: string }>;
  operator_overrideable: boolean;
  dry_run: boolean;
  status: 'promoted' | 'rejected' | 'paused' | 'policy_error' | 'error';
  detail?: string;
}

const AUDIT_DIR = '.ai/construction-loop/audit';

function getAuditFilePath(cwd: string, date?: Date): string {
  const d = date ?? new Date();
  const dateStr = d.toISOString().slice(0, 10);
  return resolve(cwd, AUDIT_DIR, `${dateStr}.jsonl`);
}

export async function auditAutoPromotion(
  cwd: string,
  record: AutoPromotionAuditRecord,
): Promise<void> {
  const dir = resolve(cwd, AUDIT_DIR);
  await mkdir(dir, { recursive: true });
  const path = getAuditFilePath(cwd, new Date(record.timestamp));
  await appendFile(path, JSON.stringify(record) + '\n', 'utf8');
}

export async function readAuditLog(
  cwd: string,
  date?: string,
): Promise<AutoPromotionAuditRecord[]> {
  const path = date
    ? resolve(cwd, AUDIT_DIR, `${date}.jsonl`)
    : getAuditFilePath(cwd);
  try {
    const raw = await readFile(path, 'utf8');
    return raw
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as AutoPromotionAuditRecord);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

export async function readAllAuditLogs(cwd: string): Promise<AutoPromotionAuditRecord[]> {
  const dir = resolve(cwd, AUDIT_DIR);
  let files: string[];
  try {
    files = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw err;
  }

  const records: AutoPromotionAuditRecord[] = [];
  for (const file of files.sort()) {
    if (!file.endsWith('.jsonl')) continue;
    const raw = await readFile(join(dir, file), 'utf8');
    for (const line of raw.split('\n')) {
      if (line.trim().length === 0) continue;
      try {
        records.push(JSON.parse(line) as AutoPromotionAuditRecord);
      } catch {
        // Skip corrupt lines
      }
    }
  }
  return records;
}

export interface MetricsResult {
  auto_promotions_total: number;
  auto_promotions_failed: number;
  operator_overrides_total: number;
  gate_rejections_by_reason: Record<string, number>;
}

export async function computeMetrics(cwd: string): Promise<MetricsResult> {
  const records = await readAllAuditLogs(cwd);
  const result: MetricsResult = {
    auto_promotions_total: 0,
    auto_promotions_failed: 0,
    operator_overrides_total: 0,
    gate_rejections_by_reason: {},
  };

  for (const r of records) {
    if (r.status === 'promoted') {
      result.auto_promotions_total++;
    } else if (r.status === 'rejected') {
      result.auto_promotions_failed++;
    }

    if (r.operator_overrideable) {
      result.operator_overrides_total++;
    }

    for (const g of r.gate_results) {
      if (!g.passed) {
        const key = g.gate;
        result.gate_rejections_by_reason[key] = (result.gate_rejections_by_reason[key] ?? 0) + 1;
      }
    }
  }

  return result;
}
