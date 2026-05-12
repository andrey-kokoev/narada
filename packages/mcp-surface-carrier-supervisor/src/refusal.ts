import type {
  DeniedSupervisorAction,
  DeniedSupervisorInputFinding,
} from './types.js';

const DENIED_INPUT_PATTERNS: Array<{
  pattern: RegExp;
  reason: DeniedSupervisorInputFinding['reason'];
}> = [
  {
    pattern: /C:\\ProgramData\\Narada\\sites\\pc\\/i,
    reason: 'PC-locus state import',
  },
  {
    pattern: /operator[-\\/]surface|operator[-\\/]surfaces|operator-surface/i,
    reason: 'operator-surface runtime copying',
  },
  {
    pattern: /narada-andrey.*(runtime|registry|mcp|surface)/i,
    reason: 'narada-andrey runtime registry import',
  },
  {
    pattern: /\.ai[\\/]mcp|\.ai[\\/]runtime|mcp[-_]?registry|runtime[-_]?registry/i,
    reason: 'source Site MCP runtime import',
  },
  {
    pattern: /secret|credential|token|\.env/i,
    reason: 'secret or credential material',
  },
];

export class DeniedMcpSupervisorInputError extends Error {
  constructor(public readonly findings: DeniedSupervisorInputFinding[]) {
    super('Denied MCP supervisor source input');
    this.name = 'DeniedMcpSupervisorInputError';
  }
}

export class DeniedMcpSupervisorActionError extends Error {
  constructor(public readonly actions: DeniedSupervisorAction[]) {
    super('Denied MCP supervisor runtime action');
    this.name = 'DeniedMcpSupervisorActionError';
  }
}

export function findDeniedSupervisorInputs(paths: string[]): DeniedSupervisorInputFinding[] {
  return paths.flatMap((path) => {
    const match = DENIED_INPUT_PATTERNS.find(({ pattern }) => pattern.test(path));
    return match ? [{ path, reason: match.reason }] : [];
  });
}

export function assertNoDeniedSupervisorInputs(paths: string[]): void {
  const findings = findDeniedSupervisorInputs(paths);
  if (findings.length > 0) {
    throw new DeniedMcpSupervisorInputError(findings);
  }
}

export function assertNoDeniedSupervisorActions(actions: DeniedSupervisorAction[] = []): void {
  if (actions.length > 0) {
    throw new DeniedMcpSupervisorActionError(actions);
  }
}
