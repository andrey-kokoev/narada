#!/usr/bin/env node
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runGovernedCommandSync } from '../packages/process-launch-posture/src/index.ts';

const DB_RELATIVE_PATH = '.ai/task-lifecycle.db';
const SNAPSHOT_RELATIVE_PATH = '.ai/task-lifecycle-snapshot.json';

type CommandResult = {
  status: number | null;
  error?: Error;
  stdout?: string | Buffer | null;
  stderr?: string | Buffer | null;
};

type CommandRunner = (
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
) => CommandResult;

export type TaskLifecycleDbGuardResult = {
  exitCode: number;
  stdout: string[];
  stderr: string[];
};

type GuardOptions = {
  root?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  runCommand?: CommandRunner;
};

const defaultRunCommand: CommandRunner = (command, args, options) => runGovernedCommandSync(command, args, {
  cwd: options.cwd,
  env: options.env,
  encoding: 'utf8',
});

function result(exitCode: number, stdout: string[] = [], stderr: string[] = []): TaskLifecycleDbGuardResult {
  return { exitCode, stdout, stderr };
}

function commandSucceeded(commandResult: CommandResult): boolean {
  return !commandResult.error && commandResult.status === 0;
}

function naradaInvocation(root: string, platform: NodeJS.Platform): { command: string; args: string[] } {
  const localShim = join(root, 'node_modules', '.bin', platform === 'win32' ? 'narada.cmd' : 'narada');
  if (existsSync(localShim)) return { command: localShim, args: [] };

  const builtCli = join(root, 'packages', 'layers', 'cli', 'dist', 'main.js');
  if (existsSync(builtCli)) return { command: process.execPath, args: [builtCli] };

  return { command: platform === 'win32' ? 'narada.cmd' : 'narada', args: [] };
}

export function guardTaskLifecycleDb({
  root = process.cwd(),
  env = process.env,
  platform = process.platform,
  runCommand = defaultRunCommand,
}: GuardOptions = {}): TaskLifecycleDbGuardResult {
  const snapshotPath = join(root, SNAPSHOT_RELATIVE_PATH);
  const dbPath = join(root, DB_RELATIVE_PATH);
  const gitBinary = env.NARADA_GIT_BINARY ?? 'git';
  const runGit = (args: string[]) => runCommand(gitBinary, args, { cwd: root, env });

  if (!existsSync(snapshotPath)) {
    return result(1, [], [
      `task lifecycle snapshot missing: ${SNAPSHOT_RELATIVE_PATH}`,
      `Run: narada task lifecycle export --output ${SNAPSHOT_RELATIVE_PATH}`,
    ]);
  }

  if (!commandSucceeded(runGit(['ls-files', '--error-unmatch', SNAPSHOT_RELATIVE_PATH]))) {
    return result(1, [], [
      `task lifecycle snapshot is not tracked: ${SNAPSHOT_RELATIVE_PATH}`,
      `Run: git add ${SNAPSHOT_RELATIVE_PATH}`,
    ]);
  }

  if (commandSucceeded(runGit(['ls-files', '--error-unmatch', DB_RELATIVE_PATH]))) {
    return result(2, [], [
      `task lifecycle DB is still tracked: ${DB_RELATIVE_PATH}`,
      `Run the sanctioned cutover: narada task lifecycle export --output ${SNAPSHOT_RELATIVE_PATH} && git rm --cached ${DB_RELATIVE_PATH}`,
    ]);
  }

  if (!commandSucceeded(runGit(['check-ignore', '-q', DB_RELATIVE_PATH]))) {
    return result(2, [], [
      `task lifecycle DB is not ignored: ${DB_RELATIVE_PATH}`,
      `Add ${DB_RELATIVE_PATH} to .gitignore after exporting the snapshot.`,
    ]);
  }

  if (!existsSync(dbPath)) {
    return result(0, [
      'task lifecycle snapshot posture ok: tracked snapshot, ignored local DB path',
      `Local DB missing; reconstruct with: narada task lifecycle import --input ${SNAPSHOT_RELATIVE_PATH}`,
    ]);
  }

  const temporaryDirectory = mkdtempSync(join(dirname(snapshotPath), '.task-lifecycle-snapshot-'));
  const temporarySnapshot = join(temporaryDirectory, 'snapshot.json');
  try {
    const invocation = naradaInvocation(root, platform);
    const exportResult = runCommand(invocation.command, [
      ...invocation.args,
      'task',
      'lifecycle',
      'export',
      '--output',
      temporarySnapshot,
      '--format',
      'json',
    ], { cwd: root, env });

    if (exportResult.error) {
      return result(2, [], [
        'narada command unavailable; cannot verify task lifecycle snapshot freshness',
        'Run: pnpm install && pnpm build',
      ]);
    }
    if (exportResult.status !== 0) {
      const detail = String(exportResult.stderr ?? '').trim();
      return result(exportResult.status ?? 2, [], detail ? [detail] : []);
    }

    if (!readFileSync(temporarySnapshot).equals(readFileSync(snapshotPath))) {
      return result(2, [], [
        `task lifecycle snapshot is stale: ${SNAPSHOT_RELATIVE_PATH}`,
        `Run: narada task lifecycle export --output ${SNAPSHOT_RELATIVE_PATH}`,
      ]);
    }

    return result(0, ['task lifecycle snapshot posture ok: tracked fresh snapshot, ignored local DB']);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function runCli(): number {
  try {
    const guardResult = guardTaskLifecycleDb();
    for (const line of guardResult.stdout) process.stdout.write(`${line}\n`);
    for (const line of guardResult.stderr) process.stderr.write(`${line}\n`);
    return guardResult.exitCode;
  } catch (error) {
    process.stderr.write(`task lifecycle snapshot guard failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}

const isEntrypoint = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false;

if (isEntrypoint) process.exitCode = runCli();
