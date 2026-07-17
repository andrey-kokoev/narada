import type { Command } from 'commander';
import { directCommandAction, silentCommandContext, type CommanderOptionValues } from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';
import { windowsUserSiteInstallCommand } from './install.js';

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
      invocation: (opts) => windowsUserSiteInstallCommand({
        siteRoot: opts.siteRoot as string | undefined,
        registryPath: opts.registryPath as string | undefined,
        profile: opts.profile as string | undefined,
        repair: opts.repair as boolean | undefined,
        format: resolveCommandFormat(opts.format, 'human'),
      }, silentCommandContext()),
    }));
}
