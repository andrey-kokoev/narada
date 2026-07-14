import { checkLaunchArtifact } from '../../scripts/launch-artifact-lib.mjs';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { ensureLaunchArtifact, naradaProperRoot } from '../lib/launch-artifact.js';
import { ExitCode } from '../lib/exit-codes.js';
import type { CommandContext } from '../lib/command-wrapper.js';

export interface LauncherArtifactOptions {
  siteRoot?: string;
  format?: CliFormat;
}

export async function launcherArtifactCheckCommand(
  target: string,
  options: LauncherArtifactOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const result = checkLaunchArtifact(options.siteRoot ?? naradaProperRoot(), target);
  return {
    exitCode: result.status === 'current' ? ExitCode.SUCCESS : ExitCode.INVALID_CONFIG,
    result: formattedResult({
      schema: 'narada.launcher.artifact_check.v1',
      mutation_performed: false,
      ...result,
    }, formatArtifactResult(result), options.format ?? 'auto'),
  };
}

export async function launcherArtifactEnsureCommand(
  target: string,
  options: LauncherArtifactOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  try {
    const result = ensureLaunchArtifact(options.siteRoot ?? naradaProperRoot(), target);
    return {
      exitCode: ExitCode.SUCCESS,
      result: formattedResult({
        schema: 'narada.launcher.artifact_ensure.v1',
        mutation_performed: true,
        ...result,
      }, formatArtifactResult(result), options.format ?? 'auto'),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        schema: 'narada.launcher.artifact_ensure.v1',
        status: 'error',
        mutation_performed: false,
        target,
        error: message,
        _formatted: `Artifact ensure failed for ${target}: ${message}`,
      },
    };
  }
}

function formatArtifactResult(result: { status: string; target: string; reason?: string; artifact_root?: string; required_command?: string }): string {
  if (result.status === 'current') {
    return [
      `Launch artifact current: ${result.target}`,
      result.artifact_root ? `  Root    ${result.artifact_root}` : null,
    ].filter(Boolean).join('\n');
  }
  return [
    `Launch artifact ${result.status}: ${result.target}`,
    result.reason ? `  Reason  ${result.reason}` : null,
    result.required_command ? `  Build   ${result.required_command}` : null,
  ].filter(Boolean).join('\n');
}
