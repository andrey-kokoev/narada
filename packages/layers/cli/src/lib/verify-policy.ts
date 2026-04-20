/**
 * Verification policy helpers
 *
 * Mirrors the policy enforced by scripts/test-focused.ts so that
 * suggestion and run operators stay consistent with the guard.
 */

export type CommandScope =
  | 'single-file'
  | 'multi-file'
  | 'package'
  | 'full-suite'
  | 'verify'
  | 'other';

export interface PolicyCheck {
  allowed: boolean;
  reason?: string;
  scope: CommandScope;
}

/**
 * Classify a verification command by scope.
 */
export function classifyCommandScope(command: string): CommandScope {
  const trimmed = command.trim();

  if (/\bpnpm\s+verify\b/.test(trimmed)) {
    return 'verify';
  }

  if (
    /\btest:full\b/.test(trimmed) ||
    /\bALLOW_FULL_TESTS=1\b/.test(trimmed) ||
    /^pnpm\s+test\b/.test(trimmed)
  ) {
    return 'full-suite';
  }

  const testFileMatches = trimmed.match(/\S+\.(?:test|spec)\.[cm]?[tj]sx?/g) ?? [];
  const testFileCount = testFileMatches.length;

  if (testFileCount === 1) return 'single-file';
  if (testFileCount > 1) return 'multi-file';

  const looksLikePackageTest =
    /\bpnpm\b/.test(trimmed) &&
    (/\btest(?::[A-Za-z0-9_-]+)?\b/.test(trimmed) ||
      /\bvitest\s+run\b/.test(trimmed));

  if (looksLikePackageTest) return 'package';

  return 'other';
}

/**
 * Validate a command against focused-test policy.
 *
 * By default:
 *   - one test file is allowed
 *   - multi-file requires ALLOW_MULTI_FILE_FOCUSED=1
 *   - package-level requires ALLOW_PACKAGE_FOCUSED=1
 *   - full-suite is rejected (must not be wrapped in test:focused)
 *   - pnpm verify is allowed
 */
export function checkCommandPolicy(
  command: string,
  overrides?: {
    allowMultiFile?: boolean;
    allowPackage?: boolean;
    allowFullSuite?: boolean;
  },
): PolicyCheck {
  const scope = classifyCommandScope(command);

  if (scope === 'verify') {
    return { allowed: true, scope };
  }

  if (scope === 'full-suite') {
    if (overrides?.allowFullSuite) {
      return { allowed: true, scope };
    }
    return {
      allowed: false,
      scope,
      reason:
        'Full-suite commands must not be wrapped in focused verification. Run them directly.',
    };
  }

  if (scope === 'single-file') {
    return { allowed: true, scope };
  }

  if (scope === 'multi-file') {
    if (overrides?.allowMultiFile) {
      return { allowed: true, scope };
    }
    return {
      allowed: false,
      scope,
      reason:
        'Multi-file focused verification requires ALLOW_MULTI_FILE_FOCUSED=1.',
    };
  }

  if (scope === 'package') {
    if (overrides?.allowPackage) {
      return { allowed: true, scope };
    }
    return {
      allowed: false,
      scope,
      reason:
        'Package-level test command has no explicit test file. Use one test file or set ALLOW_PACKAGE_FOCUSED=1.',
    };
  }

  return {
    allowed: true,
    scope,
    reason: 'Command scope could not be determined; running without focused-test guard.',
  };
}

/**
 * Extract test file paths from a command string.
 */
export function extractTestFiles(command: string): string[] {
  return command.match(/\S+\.(?:test|spec)\.[cm]?[tj]sx?/g) ?? [];
}
