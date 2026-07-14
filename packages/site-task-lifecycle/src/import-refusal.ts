import { normalize } from 'node:path';
import type { DeniedImportFinding, NeutralIdentity } from './types.js';

const DENIED_PATH_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /(^|[\\/])\.ai[\\/]task-lifecycle\.db(-shm|-wal)?$/i, reason: 'source task lifecycle database' },
  { pattern: /(^|[\\/])\.ai[\\/]db[\\/]task-lifecycle\.db$/i, reason: 'source task lifecycle database' },
  { pattern: /(^|[\\/])\.ai[\\/]mutation-evidence[\\/]task_lifecycle([\\/]|$)/i, reason: 'source task lifecycle mutation evidence' },
  { pattern: /(^|[\\/])\.ai[\\/]do-not-open[\\/]tasks([\\/]|$)/i, reason: 'source task history' },
  { pattern: /(^|[\\/])\.ai[\\/]state[\\/]agent-context\.sqlite$/i, reason: 'source agent-context checkpoint database' },
  { pattern: /(^|[\\/])\.ai[\\/]inbox\.db$/i, reason: 'source inbox database' },
  { pattern: /(^|[\\/])\.ai[\\/]inbox-envelopes([\\/]|$)/i, reason: 'source inbox envelope history' },
  { pattern: /(^|[\\/])\.ai[\\/]agents[\\/]roster\.json$/i, reason: 'source roster authority' },
  { pattern: /(^|[\\/])operator-surfaces([\\/]|$)/i, reason: 'operator-surface binding or projection state' },
  { pattern: /^c:[\\/]programdata[\\/]narada[\\/]sites[\\/]pc[\\/]/i, reason: 'PC-locus runtime state' },
  { pattern: /(^|[\\/])(secrets?|tokens?|credentials?)([\\/]|\.|$)/i, reason: 'secret or credential material' },
];

export class DeniedSourceImportError extends Error {
  readonly findings: DeniedImportFinding[];

  constructor(findings: DeniedImportFinding[]) {
    super(`Denied source imports: ${findings.map((finding) => `${finding.path} (${finding.reason})`).join(', ')}`);
    this.name = 'DeniedSourceImportError';
    this.findings = findings;
  }
}

export class NonNeutralIdentityError extends Error {
  readonly identities: string[];

  constructor(identities: string[]) {
    super(`Non-neutral fixture identities are not portable: ${identities.join(', ')}`);
    this.name = 'NonNeutralIdentityError';
    this.identities = identities;
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

export function findNonNeutralIdentities(identities: NeutralIdentity[]): string[] {
  return identities
    .map((identity) => identity.identityId)
    .filter((identityId) => identityId === 'Andrey' || identityId.startsWith('andrey-user.'));
}

export function assertNeutralIdentities(identities: NeutralIdentity[]): void {
  const nonNeutral = findNonNeutralIdentities(identities);
  if (nonNeutral.length > 0) {
    throw new NonNeutralIdentityError(nonNeutral);
  }
}
