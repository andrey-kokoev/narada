import type { Command } from 'commander';
import {directCommandAction, silentCommandContext, type CommanderOptionValues} from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';
import { onboardingRoleApprovalCommand, onboardingRoleMaterializeCommand, onboardingStartCommand, onboardingStatusCommand } from './onboarding.js';

export function registerOnboardingCommands(program: Command): void {
  const onboarding = program
    .command('onboarding')
    .description('First-time User Site onboarding');

  onboarding
    .command('start')
    .description('Start the User Site resident with safe Windows defaults')
    .option('--platform <platform>', 'Onboarding platform', 'windows')
    .option('--scope <scope>', 'Onboarding scope', 'user-site')
    .option('--site-root <path>', 'User Site root; defaults to NARADA_USER_SITE_ROOT or %USERPROFILE%\\Narada')
    .option('--registry-path <path>', 'User Site launch registry path')
    .option('--interactive', 'Ask for confirmation before starting the resident', false)
    .option('--demo', 'Show the no-credential demo path without starting a resident', false)
    .option('--no-exec', 'Plan the resident launch without starting it')
    .option('--format <fmt>', 'Output format: json|human|auto', 'human')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'onboarding start',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => onboardingStartCommand({
        platform: opts.platform as string | undefined,
        scope: opts.scope as string | undefined,
        siteRoot: opts.siteRoot as string | undefined,
        registryPath: opts.registryPath as string | undefined,
        interactive: opts.interactive as boolean | undefined,
        demo: opts.demo as boolean | undefined,
        noExec: opts.exec === false || opts.noExec === true,
        format: resolveCommandFormat(opts.format, 'human'),
      }, silentCommandContext()),
    }));

  onboarding
    .command('status')
    .description('Verify User Site resident first-use readiness from NARS health and events')
    .option('--platform <platform>', 'Onboarding platform', 'windows')
    .option('--scope <scope>', 'Onboarding scope', 'user-site')
    .option('--site-root <path>', 'User Site root; defaults to NARADA_USER_SITE_ROOT or %USERPROFILE%\\Narada')
    .option('--session <id>', 'Verify one concrete resident session')
    .option('--format <fmt>', 'Output format: json|human|auto', 'human')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'onboarding status',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => onboardingStatusCommand({
        platform: opts.platform as string | undefined,
        scope: opts.scope as string | undefined,
        siteRoot: opts.siteRoot as string | undefined,
        session: opts.session as string | undefined,
        format: resolveCommandFormat(opts.format, 'human'),
      }, silentCommandContext()),
    }));

  const roles = onboarding
    .command('roles')
    .description('Review and record explicit resident role expansion approval');

  roles
    .command('approve')
    .description('Approve architect/builder expansion without silently mutating the Site roster')
    .option('--platform <platform>', 'Onboarding platform', 'windows')
    .option('--scope <scope>', 'Onboarding scope', 'user-site')
    .option('--site-root <path>', 'User Site root; defaults to NARADA_USER_SITE_ROOT or %USERPROFILE%\\Narada')
    .option('--roles <role...>', 'Roles to approve; defaults to the stored recommendation')
    .option('--confirm', 'Confirm the displayed role expansion preview', false)
    .option('--format <fmt>', 'Output format: json|human|auto', 'human')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'onboarding roles approve',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => onboardingRoleApprovalCommand({
        platform: opts.platform as string | undefined,
        scope: opts.scope as string | undefined,
        siteRoot: opts.siteRoot as string | undefined,
        roles: opts.roles as string[] | undefined,
        confirm: opts.confirm as boolean | undefined,
        format: resolveCommandFormat(opts.format, 'human'),
      }, silentCommandContext()),
    }));

  roles
    .command('materialize')
    .description('Write approved roles into the launch registry as quiet background entries')
    .option('--platform <platform>', 'Onboarding platform', 'windows')
    .option('--scope <scope>', 'Onboarding scope', 'user-site')
    .option('--site-root <path>', 'User Site root; defaults to NARADA_USER_SITE_ROOT or %USERPROFILE%\\Narada')
    .option('--roles <role...>', 'Approved roles to materialize; defaults to all approved roles')
    .option('--format <fmt>', 'Output format: json|human|auto', 'human')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'onboarding roles materialize',
      emit: emitCommandResult,
      format: (opts: CommanderOptionValues) => opts.format,
      invocation: (opts) => onboardingRoleMaterializeCommand({
        platform: opts.platform as string | undefined,
        scope: opts.scope as string | undefined,
        siteRoot: opts.siteRoot as string | undefined,
        roles: opts.roles as string[] | undefined,
        format: resolveCommandFormat(opts.format, 'human'),
      }, silentCommandContext()),
    }));
}
