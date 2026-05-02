import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

export interface TaskReportFileFields {
  summary?: string;
  reviewer?: string;
  changedFiles?: string;
  verification?: string;
  residuals?: string;
}

interface RawReportFile {
  summary?: unknown;
  reviewer?: unknown;
  changedFiles?: unknown;
  changed_files?: unknown;
  verification?: unknown;
  residuals?: unknown;
  known_residuals?: unknown;
}

function stringifyStringList(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) throw new Error(`${field} must be a string or string array`);
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== 'string') throw new Error(`${field}[${i}] must be a string`);
  }
  return JSON.stringify(value);
}

function stringifyVerification(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) throw new Error('verification must be a JSON string or array');
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (typeof item !== 'object' || item === null) {
      throw new Error(`verification[${i}] must be an object`);
    }
    const record = item as Record<string, unknown>;
    if (typeof record.command !== 'string') {
      throw new Error(`verification[${i}].command must be a string`);
    }
    if (typeof record.result !== 'string') {
      throw new Error(`verification[${i}].result must be a string`);
    }
  }
  return JSON.stringify(value);
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
  return value;
}

export async function readTaskReportFile(reportFile: string, cwd: string): Promise<TaskReportFileFields> {
  const path = isAbsolute(reportFile) ? reportFile : resolve(cwd, reportFile);
  const raw = await readFile(path, 'utf8');
  let parsed: RawReportFile;
  try {
    parsed = JSON.parse(raw) as RawReportFile;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse --report-file JSON: ${message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('--report-file must contain a JSON object');
  }
  return {
    summary: optionalString(parsed.summary, 'summary'),
    reviewer: optionalString(parsed.reviewer, 'reviewer'),
    changedFiles: stringifyStringList(parsed.changedFiles ?? parsed.changed_files, 'changed_files'),
    verification: stringifyVerification(parsed.verification),
    residuals: stringifyStringList(parsed.residuals ?? parsed.known_residuals, 'residuals'),
  };
}

export function mergeTaskReportFileFields<T extends TaskReportFileFields>(
  options: T,
  fields: TaskReportFileFields,
): T {
  return {
    ...options,
    summary: options.summary ?? fields.summary,
    reviewer: options.reviewer ?? fields.reviewer,
    changedFiles: options.changedFiles ?? fields.changedFiles,
    verification: options.verification ?? fields.verification,
    residuals: options.residuals ?? fields.residuals,
  };
}
