#!/usr/bin/env node
import {
  closeSupervisedSession,
  failSupervisedSession,
  heartbeatSupervisedSession,
  interruptSupervisedSession,
  startSupervisedSession,
  supervisorDoctor,
} from './supervisor.mjs';
import { buildNaradaNativeDoctorCommand } from './doctor-command.mjs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let i = 0; i < rest.length; i += 1) {
    const key = rest[i];
    if (!key?.startsWith('--')) throw new Error(`Unexpected argument: ${key}`);
    const name = key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const value = rest[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
    options[name] = value;
    i += 1;
  }
  return { command, options };
}

function requireOption(options, name) {
  const value = options[name];
  if (!value) throw new Error(`--${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} is required`);
  return value;
}

function supervisedOptions(options) {
  return {
    siteRoot: requireOption(options, 'siteRoot'),
    carrierSessionId: requireOption(options, 'carrierSessionId'),
    agentId: requireOption(options, 'agentId'),
    now: options.now,
  };
}

function runSupervisorCli(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);
  if (!command || command === 'help') {
    return {
      status: 'ok',
      commands: ['doctor', 'doctor-compact', 'inspect', 'start', 'heartbeat', 'interrupt', 'close', 'fail'],
      raw_transcript_recorded: false,
      raw_secret_values_recorded: false,
    };
  }
  if (command === 'doctor-compact') {
    return buildNaradaNativeDoctorCommand({
      siteRoot: requireOption(options, 'siteRoot'),
      carrierSessionId: requireOption(options, 'carrierSessionId'),
      format: options.format === 'human' ? 'human' : 'json',
    });
  }
  if (command === 'doctor' || command === 'inspect') {
    if (options.format === 'human' || options.format === 'json') {
      return buildNaradaNativeDoctorCommand({
        siteRoot: requireOption(options, 'siteRoot'),
        carrierSessionId: requireOption(options, 'carrierSessionId'),
        format: options.format,
      });
    }
    return {
      status: 'success',
      command,
      result: supervisorDoctor(
        requireOption(options, 'siteRoot'),
        requireOption(options, 'carrierSessionId'),
      ),
      direct_task_lifecycle_mutation: false,
      direct_inbox_mutation: false,
      direct_outbox_mutation: false,
      direct_publication_mutation: false,
      credential_access: false,
      external_site_mutation: false,
      raw_transcript_recorded: false,
      raw_secret_values_recorded: false,
    };
  }
  const base = supervisedOptions(options);
  if (command === 'start') return { status: 'success', command, result: startSupervisedSession(base) };
  if (command === 'heartbeat') return { status: 'success', command, result: heartbeatSupervisedSession(base) };
  if (command === 'interrupt') return { status: 'success', command, result: interruptSupervisedSession(base) };
  if (command === 'close') return { status: 'success', command, result: closeSupervisedSession(base) };
  if (command === 'fail') return { status: 'success', command, result: failSupervisedSession({ ...base, reason: options.reason }) };
  throw new Error(`Unsupported supervisor command: ${command}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    console.log(JSON.stringify(runSupervisorCli(), null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      raw_transcript_recorded: false,
      raw_secret_values_recorded: false,
    }, null, 2));
    process.exitCode = 1;
  }
}

export {
  parseArgs,
  runSupervisorCli,
};
