import { normalize } from 'node:path';
import type { DeniedImportFinding } from './types.js';

const DENIED_PATH_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /(^|[\\/])\.crew([\\/]|$)/i, reason: 'source Site crew shortcut state' },
  { pattern: /(^|[\\/])\.ai[\\/]state([\\/]|$)/i, reason: 'source runtime state' },
  { pattern: /(^|[\\/])\.ai[\\/]checkpoints([\\/]|$)/i, reason: 'source checkpoint history' },
  { pattern: /(^|[\\/])\.narada[\\/]checkpoints([\\/]|$)/i, reason: 'source checkpoint history' },
  { pattern: /(^|[\\/])\.ai[\\/]task-lifecycle\.db(-shm|-wal)?$/i, reason: 'source task lifecycle database' },
  { pattern: /(^|[\\/])\.ai[\\/]do-not-open[\\/]tasks([\\/]|$)/i, reason: 'source task history' },
  { pattern: /(^|[\\/])\.ai[\\/]inbox(\.db|[\\/]|$)/i, reason: 'source inbox state' },
  { pattern: /(^|[\\/])operator-surfaces([\\/]|$)/i, reason: 'operator-surface runtime state' },
  { pattern: /^c:[\\/]programdata[\\/]narada[\\/]sites[\\/]pc[\\/]/i, reason: 'PC-locus runtime state' },
  { pattern: /(^|[\\/])(secrets?|tokens?|credentials?)([\\/]|\.|$)/i, reason: 'secret or credential material' },
  { pattern: /\.(lnk|ps1|bat|cmd)$/i, reason: 'carrier-specific native shortcut or script' },
];

export class DeniedSourceImportError extends Error {
  readonly findings: DeniedImportFinding[];

  constructor(findings: DeniedImportFinding[]) {
    super(`Denied crew startup source imports: ${findings.map((finding) => `${finding.path} (${finding.reason})`).join(', ')}`);
    this.name = 'DeniedSourceImportError';
    this.findings = findings;
  }
}

export function findDeniedSourceImports(paths: string[]): DeniedImportFinding[] {
  return paths.flatMap((path) => {
    const normalized = normalize(path).replaceAll('\\', '/');
    const comparable = normalized.replaceAll('/', '\\');
    const denied = DENIED_PATH_PATTERNS.find(({ pattern }) => pattern.test(comparable));
    return denied ? [{ path, reason: denied.reason }] : [];
  });
}

export function assertNoDeniedSourceImports(paths: string[]): void {
  const findings = findDeniedSourceImports(paths);
  if (findings.length > 0) {
    throw new DeniedSourceImportError(findings);
  }
}
