#!/usr/bin/env tsx
/**
 * Guard script for `pnpm test` at repository root.
 *
 * Prevents accidental full-suite execution by requiring explicit intent.
 */

console.error('Error: `pnpm test` is disabled at the repository root to prevent accidental full-suite runs.');
console.error('');
console.error('Use one of these instead:');
console.error('  pnpm verify              — fast verification (typecheck + build + fast tests, ~15 sec)');
console.error('  pnpm test:focused "<cmd>" — run a focused command with telemetry recording');
console.error('  pnpm test:unit           — unit tests across all packages (heavy suites included)');
console.error('  pnpm test:integration    — integration tests only');
console.error('  pnpm test:control-plane  — control-plane tests only');
console.error('  pnpm test:daemon         — daemon tests only');
console.error('  pnpm test:full           — full recursive test suite (requires ALLOW_FULL_TESTS=1)');
console.error('');
console.error('For package-scoped testing:');
console.error('  cd packages/<pkg> && pnpm test');
console.error('  pnpm --filter=<pkg> test');
console.error('');
console.error('Example:');
console.error('  ALLOW_FULL_TESTS=1 pnpm test:full');

process.exit(1);
