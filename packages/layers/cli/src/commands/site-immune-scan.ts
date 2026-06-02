import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { validateMutationEvidenceRecord } from '@narada2/task-governance-core/mutation-evidence';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';

export type SiteImmuneFindingSeverity = 'info' | 'warning' | 'tamper_suspected';

export interface SiteImmuneFinding {
  zone: string;
  predicate: string;
  severity: SiteImmuneFindingSeverity;
  status: 'pass' | 'attention';
  detail: string;
  path?: string;
  next_command?: string;
}

export interface SiteImmuneScanOptions {
  cwd?: string;
  format?: CliFormat;
  limit?: number;
}

export async function siteImmuneScanCommand(
  options: SiteImmuneScanOptions = {},
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
  const findings: SiteImmuneFinding[] = [];

  findings.push(await inspectConfig(cwd));
  findings.push(await inspectTaskLifecycleSnapshot(cwd));
  findings.push(...await inspectMutationEvidence(cwd));
  findings.push(...await inspectRegistryJson(cwd));

  const attention = findings.filter((finding) => finding.status === 'attention');
  const tamperSuspected = attention.filter((finding) => finding.severity === 'tamper_suspected');
  const status = tamperSuspected.length > 0
    ? 'tamper_suspected'
    : attention.length > 0
      ? 'attention'
      : 'ok';

  const result = {
    status,
    immune_posture: 'observe_classify_report_only',
    site_root: cwd,
    scanned_zones: ['site_config', 'task_lifecycle_snapshot', 'mutation_evidence', 'authority_registries'],
    counts: {
      findings: findings.length,
      attention: attention.length,
      tamper_suspected: tamperSuspected.length,
    },
    findings: findings.slice(0, limit),
    truncated_findings: Math.max(0, findings.length - limit),
    next_commands: nextCommands(attention),
  };

  return {
    exitCode: tamperSuspected.length > 0 ? ExitCode.INTEGRITY_ISSUES : ExitCode.SUCCESS,
    result: formattedResult(
      result,
      [
        `Site immune scan: ${status}`,
        `Posture: observe/classify/report only`,
        `Site root: ${cwd}`,
        `Findings: ${findings.length}; attention: ${attention.length}; tamper suspected: ${tamperSuspected.length}`,
        ...findings.slice(0, limit).map((finding) =>
          `${finding.status} ${finding.severity} ${finding.zone}/${finding.predicate}: ${finding.detail}`),
      ],
      options.format ?? 'auto',
    ),
  };
}

async function inspectConfig(cwd: string): Promise<SiteImmuneFinding> {
  const path = join(cwd, 'config.json');
  if (!existsSync(path)) {
    return attention('site_config', 'config_present', 'warning', 'config.json is missing', path, 'narada sites doctor <site-id> --root <site-root>');
  }
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    if (typeof parsed.site_id !== 'string' || parsed.site_id.trim().length === 0) {
      const looksLikeSiteConfig = 'site_kind' in parsed || 'site_root' in parsed || 'locus' in parsed;
      return looksLikeSiteConfig
        ? attention('site_config', 'site_id_present', 'tamper_suspected', 'Site-shaped config.json lacks site_id', path, 'narada sites doctor <site-id> --root <site-root>')
        : pass('site_config', 'operation_config_parse', 'config.json parses as non-Site operation config', path);
    }
    return pass('site_config', 'config_parse', `config.json parses for Site ${parsed.site_id}`, path);
  } catch (error) {
    return attention('site_config', 'config_parse', 'tamper_suspected', `config.json is not valid JSON: ${message(error)}`, path);
  }
}

async function inspectTaskLifecycleSnapshot(cwd: string): Promise<SiteImmuneFinding> {
  const dbPath = [
    join(cwd, '.ai', 'task-lifecycle.db'),
    join(cwd, '.ai', 'do-not-open', 'task-lifecycle.db'),
    join(cwd, '.ai', 'tasks', 'task-lifecycle.db'),
  ].find((candidate) => existsSync(candidate)) ?? join(cwd, '.ai', 'task-lifecycle.db');
  const snapshotPath = join(cwd, '.ai', 'task-lifecycle-snapshot.json');
  const dbExists = existsSync(dbPath);
  const snapshotExists = existsSync(snapshotPath);
  if (!dbExists && !snapshotExists) {
    return pass('task_lifecycle_snapshot', 'authority_surface_absent', 'task lifecycle authority surface not present');
  }
  if (dbExists && !snapshotExists) {
    return attention(
      'task_lifecycle_snapshot',
      'snapshot_present',
      'warning',
      'task lifecycle DB exists without Git-visible snapshot evidence',
      snapshotPath,
      'narada task lifecycle export --output .ai/task-lifecycle-snapshot.json',
    );
  }
  if (!dbExists && snapshotExists) {
    return attention(
      'task_lifecycle_snapshot',
      'db_present',
      'warning',
      'task lifecycle snapshot exists but local SQLite authority DB is missing',
      dbPath,
      'narada task lifecycle import --input .ai/task-lifecycle-snapshot.json',
    );
  }
  const [dbStat, snapshotStat] = await Promise.all([stat(dbPath), stat(snapshotPath)]);
  if (dbStat.mtimeMs > snapshotStat.mtimeMs + 1000) {
    return attention(
      'task_lifecycle_snapshot',
      'snapshot_freshness',
      'warning',
      'task lifecycle DB is newer than exported snapshot',
      snapshotPath,
      'narada task lifecycle export --output .ai/task-lifecycle-snapshot.json',
    );
  }
  return pass('task_lifecycle_snapshot', 'snapshot_freshness', 'task lifecycle snapshot is present and not older than DB', snapshotPath);
}

async function inspectMutationEvidence(cwd: string): Promise<SiteImmuneFinding[]> {
  const evidenceRoot = join(cwd, '.ai', 'mutation-evidence');
  if (!existsSync(evidenceRoot)) {
    return [pass('mutation_evidence', 'evidence_root_present', 'mutation evidence root is absent; no evidence files to inspect')];
  }
  const files = await listJsonFiles(evidenceRoot);
  if (files.length === 0) {
    return [pass('mutation_evidence', 'evidence_files_parse', 'mutation evidence root has no JSON files')];
  }
  const findings: SiteImmuneFinding[] = [];
  let valid = 0;
  for (const file of files) {
    try {
      const parsed = JSON.parse(await readFile(file, 'utf8')) as unknown;
      const errors = validateMutationEvidenceRecord(parsed);
      if (errors.length > 0) {
        findings.push(attention(
          'mutation_evidence',
          'evidence_record_shape',
          'tamper_suspected',
          errors.map((error) => `${error.field}: ${error.message}`).join('; '),
          file,
        ));
      } else {
        valid += 1;
      }
    } catch (error) {
      findings.push(attention('mutation_evidence', 'evidence_record_parse', 'tamper_suspected', `invalid JSON: ${message(error)}`, file));
    }
  }
  if (findings.length === 0) {
    findings.push(pass('mutation_evidence', 'evidence_files_parse', `${valid} mutation evidence files parse and validate`, evidenceRoot));
  }
  return findings;
}

async function inspectRegistryJson(cwd: string): Promise<SiteImmuneFinding[]> {
  const registries = [
    '.ai/routing-addressing-registry.json',
    '.ai/capability-consent-registry.json',
    '.ai/site-relation-registry.json',
  ];
  const findings: SiteImmuneFinding[] = [];
  for (const relative of registries) {
    const path = join(cwd, relative);
    if (!existsSync(path)) {
      findings.push(pass('authority_registries', 'registry_absent', `${relative} absent`, path));
      continue;
    }
    try {
      JSON.parse(await readFile(path, 'utf8'));
      findings.push(pass('authority_registries', 'registry_parse', `${relative} parses`, path));
    } catch (error) {
      findings.push(attention('authority_registries', 'registry_parse', 'tamper_suspected', `${relative} is invalid JSON: ${message(error)}`, path));
    }
  }
  return findings;
}

async function listJsonFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listJsonFiles(path));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(path);
    }
  }
  return files.sort();
}

function pass(zone: string, predicate: string, detail: string, path?: string): SiteImmuneFinding {
  return {
    zone,
    predicate,
    severity: 'info',
    status: 'pass',
    detail,
    ...(path ? { path } : {}),
  };
}

function attention(
  zone: string,
  predicate: string,
  severity: Exclude<SiteImmuneFindingSeverity, 'info'>,
  detail: string,
  path?: string,
  nextCommand?: string,
): SiteImmuneFinding {
  return {
    zone,
    predicate,
    severity,
    status: 'attention',
    detail,
    ...(path ? { path } : {}),
    ...(nextCommand ? { next_command: nextCommand } : {}),
  };
}

function nextCommands(findings: SiteImmuneFinding[]): string[] {
  return Array.from(new Set(findings.map((finding) => finding.next_command).filter((value): value is string => Boolean(value))));
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
