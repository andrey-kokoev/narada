import type { Command } from 'commander';
import {directCommandAction, type CommanderOptionValues} from '../lib/command-wrapper.js';
import { emitCommandResult } from '../lib/cli-output.js';
import { siteTelemetryPublishCommand, siteTelemetryPullCommand } from './site-telemetry.js';

export function registerSiteTelemetryCommands(program: Command): void {
  const cmd = program
    .command('site-telemetry')
    .description('Local Site Telemetry publish/pull wrappers');

  const publish = cmd
    .command('publish')
    .description('Prepare or send a bounded Site telemetry event')
    .requiredOption('--edge-file <path>', 'Publication Edge JSON file')
    .requiredOption('--event-file <path>', 'Bounded event JSON file')
    .option('--send', 'Perform transport; default is dry-run', false)
    .option('--expected-surface-id <id>', 'Expected target surface id')
    .option('--credential-ref-status <status>', 'Credential ref status for preflight')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'site-telemetry publish',
      emit: emitCommandResult,
      invocation: (opts) => siteTelemetryPublishCommand({
        edgeFile: opts.edgeFile as string | undefined,
        eventFile: opts.eventFile as string | undefined,
        send: opts.send as boolean | undefined,
        expectedSurfaceId: opts.expectedSurfaceId as string | undefined,
        credentialRefStatus: opts.credentialRefStatus as SiteTelemetryCredentialStatus | undefined,
      }),
    }));

  publish
    .command('plan')
    .description('Build a bounded publish plan without transport')
    .requiredOption('--edge-file <path>', 'Publication Edge JSON file')
    .requiredOption('--event-file <path>', 'Bounded event JSON file')
    .option('--expected-surface-id <id>', 'Expected target surface id')
    .option('--credential-ref-status <status>', 'Credential ref status for preflight')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'site-telemetry publish plan',
      emit: emitCommandResult,
      invocation: (opts) => siteTelemetryPublishCommand({
        edgeFile: opts.edgeFile as string | undefined,
        eventFile: opts.eventFile as string | undefined,
        send: false,
        expectedSurfaceId: opts.expectedSurfaceId as string | undefined,
        credentialRefStatus: opts.credentialRefStatus as SiteTelemetryCredentialStatus | undefined,
      }),
    }));

  publish
    .command('run')
    .description('Send a bounded Site telemetry event after explicit operator invocation')
    .requiredOption('--edge-file <path>', 'Publication Edge JSON file')
    .requiredOption('--event-file <path>', 'Bounded event JSON file')
    .option('--expected-surface-id <id>', 'Expected target surface id')
    .option('--credential-ref-status <status>', 'Credential ref status for preflight')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'site-telemetry publish run',
      emit: emitCommandResult,
      invocation: (opts) => siteTelemetryPublishCommand({
        edgeFile: opts.edgeFile as string | undefined,
        eventFile: opts.eventFile as string | undefined,
        send: true,
        expectedSurfaceId: opts.expectedSurfaceId as string | undefined,
        credentialRefStatus: opts.credentialRefStatus as SiteTelemetryCredentialStatus | undefined,
      }),
    }));

  const pull = cmd
    .command('pull')
    .description('Prepare or run a remote candidate pull preview')
    .requiredOption('--registry-url <url>', 'Hosted registry base URL')
    .requiredOption('--poll-capability-ref <ref>', 'Poll capability reference')
    .requiredOption('--finalize-capability-ref <ref>', 'Finalize capability reference')
    .option('--import', 'Perform remote pull preview; default is dry-run', false)
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'site-telemetry pull',
      emit: emitCommandResult,
      invocation: (opts) => siteTelemetryPullCommand({
        registryUrl: opts.registryUrl as string | undefined,
        pollCapabilityRef: opts.pollCapabilityRef as string | undefined,
        finalizeCapabilityRef: opts.finalizeCapabilityRef as string | undefined,
        importCandidates: opts.import as boolean | undefined,
      }),
    }));

  pull
    .command('plan')
    .description('Build a remote candidate pull plan without network or local mutation')
    .requiredOption('--registry-url <url>', 'Hosted registry base URL')
    .requiredOption('--poll-capability-ref <ref>', 'Poll capability reference')
    .requiredOption('--finalize-capability-ref <ref>', 'Finalize capability reference')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'site-telemetry pull plan',
      emit: emitCommandResult,
      invocation: (opts) => siteTelemetryPullCommand({
        registryUrl: opts.registryUrl as string | undefined,
        pollCapabilityRef: opts.pollCapabilityRef as string | undefined,
        finalizeCapabilityRef: opts.finalizeCapabilityRef as string | undefined,
        importCandidates: false,
      }),
    }));

  pull
    .command('run')
    .description('Poll remote candidates after explicit operator invocation')
    .requiredOption('--registry-url <url>', 'Hosted registry base URL')
    .requiredOption('--poll-capability-ref <ref>', 'Poll capability reference')
    .requiredOption('--finalize-capability-ref <ref>', 'Finalize capability reference')
    .action(directCommandAction<[CommanderOptionValues]>({
      command: 'site-telemetry pull run',
      emit: emitCommandResult,
      invocation: (opts) => siteTelemetryPullCommand({
        registryUrl: opts.registryUrl as string | undefined,
        pollCapabilityRef: opts.pollCapabilityRef as string | undefined,
        finalizeCapabilityRef: opts.finalizeCapabilityRef as string | undefined,
        importCandidates: true,
      }),
    }));
}

type SiteTelemetryCredentialStatus = 'fresh' | 'stale' | 'missing' | 'revoked' | 'unknown';
