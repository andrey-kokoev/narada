/**
 * Standardized exit codes for CLI commands
 */

export enum ExitCode {
  SUCCESS = 0,
  GENERAL_ERROR = 1,
  INVALID_CONFIG = 2,
  SYNC_RETRYABLE = 3,
  SYNC_FATAL = 4,
  INTEGRITY_ISSUES = 5,
  LOCK_TIMEOUT = 6,
}

export const ExitCodeDescriptions: Record<ExitCode, string> = {
  [ExitCode.SUCCESS]: 'Success',
  [ExitCode.GENERAL_ERROR]: 'General error',
  [ExitCode.INVALID_CONFIG]: 'Invalid configuration',
  [ExitCode.SYNC_RETRYABLE]: 'Sync failed (retryable)',
  [ExitCode.SYNC_FATAL]: 'Sync failed (fatal)',
  [ExitCode.INTEGRITY_ISSUES]: 'Integrity check found issues',
  [ExitCode.LOCK_TIMEOUT]: 'Could not acquire lock',
};
