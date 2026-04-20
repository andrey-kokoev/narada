/**
 * Type declarations for @narada.usc packages.
 *
 * These packages are JavaScript ESM with no built-in TypeScript declarations.
 * Narada proper calls their derive-class functions only.
 */

declare module '@narada.usc/compiler' {
  export function initRepo(options: Record<string, unknown>): string;
  export function plan(options: Record<string, unknown>): {
    taskGraphPath: string;
    summary: {
      task_count: number;
      proposed_count: number;
      admitted_count: number;
    };
  };
  export function createCycle(options: Record<string, unknown>): string;
}

declare module '@narada.usc/compiler/src/refine-intent.js' {
  export function refineIntent(
    intent: string,
    domainHint?: string | null,
  ): Promise<Record<string, unknown>>;
}

declare module '@narada.usc/core/src/validator.js' {
  export function validateAll(options?: {
    rootDir?: string;
    appPath?: string;
  }): {
    results: Array<{ name: string; valid: boolean; errors: string[] }>;
    allPassed: boolean;
  };
}
