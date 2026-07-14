import type { Command } from 'commander';
import {directCommandAction, type CommanderOptionValues} from '../lib/command-wrapper.js';
import { emitCommandResult } from '../lib/cli-output.js';
import { siteRegistryRelationPlanTransitionCommand } from './site-registry.js';

export function registerSiteRegistryCommands(program: Command): void {
  const cmd = program
    .command('site-registry')
    .description('Site Registry relation and projection operators');

  const relation = cmd
    .command('relation')
    .description('Site Registry relation lifecycle operators');

  relation
    .command('plan-transition')
    .description('Plan a Site Registry relation transition without network or secret resolution')
    .requiredOption('--payload-file <path>', 'Relation transition payload JSON file')
    .option('--registry-url <url>', 'Hosted registry URL override')
    .option('--credential-ref <ref>', 'Credential reference override; raw secret values are refused')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'site-registry relation plan-transition',
      emit: emitCommandResult,
      invocation: (opts) => siteRegistryRelationPlanTransitionCommand({
        payloadFile: opts.payloadFile as string | undefined,
        registryUrl: opts.registryUrl as string | undefined,
        credentialRef: opts.credentialRef as string | undefined,
      }),
    }));
}
