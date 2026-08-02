import type { Command } from 'commander';
import { directCommandAction, silentCommandContext, type CommanderOptionValues } from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';
import { linuxInstallationLifecycleCommand } from './linux-installation-lifecycle.js';

export function registerInstallCommands(program: Command): void {
  const install = program
    .command('install')
    .description('Install package-owned Narada user assets');

  install
    .command('windows-user-site')
    .description('Provision the Windows User Site and install its launcher/provider helpers')
    .option('--site-root <path>', 'User Site root; defaults to NARADA_USER_SITE_ROOT or %USERPROFILE%\\Narada')
    .option('--registry-path <path>', 'User Site launch registry path')
    .option('--profile <profile>', 'Install profile: minimal|advanced; repair preserves the existing profile when omitted')
    .option('--repair', 'Rewrite package-owned assets and repair missing User Site files', false)
    .option('--format <fmt>', 'Output format: json|human|auto', 'human')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'install windows-user-site',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: async (opts) => {
        const { windowsUserSiteInstallCommand } = await import('./install.js');
        return windowsUserSiteInstallCommand({
          siteRoot: opts.siteRoot as string | undefined,
          registryPath: opts.registryPath as string | undefined,
          profile: opts.profile as string | undefined,
          repair: opts.repair as boolean | undefined,
          format: resolveCommandFormat(opts.format, 'human'),
        }, silentCommandContext());
      },
    }));

  install
    .command('linux-lifecycle')
    .argument('<operation>', 'Lifecycle operation: upgrade|uninstall|rollback|migrate')
    .description('Plan or apply Linux installation maintenance without deleting Site data by default')
    .requiredOption('--site-id <id>', 'Linux Site identity')
    .requiredOption('--site-root <path>', 'Linux Site authority root')
    .option('--mode <mode>', 'Linux Site mode: user|system', 'user')
    .option('--current-version <version>', 'Installed CLI version when no lifecycle state exists')
    .option('--target-version <version>', 'Target CLI version for upgrade')
    .option('--current-schema-version <version>', 'Current Site schema version')
    .option('--target-schema-version <version>', 'Target Site schema version for migration')
    .option('--rollback-to <version>', 'Version to restore for rollback')
    .option('--migration-artifact <ref>', 'Admitted migration artifact reference')
    .option('--supervisor-registered', 'Declare that a supervisor is registered', false)
    .option('--remove-data', 'Request data removal; refused unless a separate guarded operation is used', false)
    .option('--confirm-data-removal <token>', 'Reserved explicit data-removal confirmation token')
    .option('--operation-id <id>', 'Stable operation id for repeatable evidence paths')
    .option('--apply', 'Persist the Site-owned lifecycle receipt and installation state', false)
    .option('--format <fmt>', 'Output format: json|human|auto', 'human')
    .action(directCommandAction<[string, CommanderOptionValues]>({
      command: 'install linux-lifecycle',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (operation, opts) => linuxInstallationLifecycleCommand(
        operation as 'upgrade' | 'uninstall' | 'rollback' | 'migrate',
        {
          siteId: opts.siteId as string,
          siteRoot: opts.siteRoot as string,
          mode: opts.mode as 'system' | 'user' | undefined,
          currentVersion: opts.currentVersion as string | undefined,
          targetVersion: opts.targetVersion as string | undefined,
          currentSchemaVersion: opts.currentSchemaVersion as string | undefined,
          targetSchemaVersion: opts.targetSchemaVersion as string | undefined,
          rollbackToVersion: opts.rollbackTo as string | undefined,
          migrationArtifactRef: opts.migrationArtifact as string | undefined,
          supervisorRegistered: opts.supervisorRegistered as boolean | undefined,
          removeData: opts.removeData as boolean | undefined,
          confirmDataRemoval: opts.confirmDataRemoval as string | undefined,
          operationId: opts.operationId as string | undefined,
          apply: opts.apply as boolean | undefined,
          format: resolveCommandFormat(opts.format, 'human'),
        },
        silentCommandContext(),
      ),
    }));
}
