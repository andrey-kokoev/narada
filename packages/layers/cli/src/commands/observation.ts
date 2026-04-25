import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ExitCode } from '../lib/exit-codes.js';
import { openTaskLifecycleStore } from '../lib/task-lifecycle-store.js';

export interface ObservationInspectOptions {
  artifactId?: string;
  cwd?: string;
  content?: boolean;
  format?: 'json' | 'human' | 'auto';
}

export interface ObservationListOptions {
  cwd?: string;
  limit?: number;
  format?: 'json' | 'human' | 'auto';
}

export async function observationListCommand(
  options: ObservationListOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const limit = Number.isFinite(options.limit) ? Math.max(1, Number(options.limit)) : 20;
  const store = openTaskLifecycleStore(cwd);
  try {
    const artifacts = store.listObservationArtifacts(limit);
    if (options.format === 'json') {
      return { exitCode: ExitCode.SUCCESS, result: { status: 'success', count: artifacts.length, artifacts } };
    }
    return {
      exitCode: ExitCode.SUCCESS,
      result: artifacts.length === 0
        ? 'No observation artifacts found.'
        : artifacts.map((a) => `${a.artifact_id} ${a.source_operator} ${a.artifact_uri}`).join('\n'),
    };
  } finally {
    store.db.close();
  }
}

export async function observationInspectCommand(
  options: ObservationInspectOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  if (!options.artifactId) {
    return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: 'artifact id is required' } };
  }
  const store = openTaskLifecycleStore(cwd);
  try {
    const artifact = store.getObservationArtifact(options.artifactId);
    if (!artifact) {
      return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: `Observation artifact not found: ${options.artifactId}` } };
    }
    const absolute_path = join(cwd, artifact.artifact_uri);
    const admitted_view = JSON.parse(artifact.admitted_view_json) as Record<string, unknown>;
    const content = options.content ? await readFile(absolute_path, 'utf8') : undefined;
    const result = {
      status: 'success',
      artifact: {
        ...artifact,
        admitted_view,
        absolute_path,
        ...(content !== undefined ? { content } : {}),
      },
    };
    if (options.format === 'json') {
      return { exitCode: ExitCode.SUCCESS, result };
    }
    const lines = [
      `${artifact.artifact_id}`,
      `  type: ${artifact.artifact_type}`,
      `  source: ${artifact.source_operator}`,
      `  path: ${artifact.artifact_uri}`,
      `  digest: ${artifact.digest}`,
    ];
    if (content !== undefined) {
      lines.push('', content);
    }
    return { exitCode: ExitCode.SUCCESS, result: lines.join('\n') };
  } finally {
    store.db.close();
  }
}

export async function observationOpenCommand(
  options: ObservationInspectOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  if (!options.artifactId) {
    return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: 'artifact id is required' } };
  }
  const store = openTaskLifecycleStore(cwd);
  try {
    const artifact = store.getObservationArtifact(options.artifactId);
    if (!artifact) {
      return { exitCode: ExitCode.GENERAL_ERROR, result: { status: 'error', error: `Observation artifact not found: ${options.artifactId}` } };
    }
    const absolutePath = join(cwd, artifact.artifact_uri);
    const result = {
      status: 'success',
      artifact_id: artifact.artifact_id,
      artifact_uri: artifact.artifact_uri,
      absolute_path: absolutePath,
      open_command: `xdg-open ${JSON.stringify(absolutePath)}`,
    };
    if (options.format === 'json') {
      return { exitCode: ExitCode.SUCCESS, result };
    }
    return { exitCode: ExitCode.SUCCESS, result: `${absolutePath}\n${result.open_command}` };
  } finally {
    store.db.close();
  }
}
