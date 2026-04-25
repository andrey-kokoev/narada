import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { openTaskLifecycleStore, type ObservationArtifactRow } from './task-lifecycle-store.js';

export interface ObservationView {
  artifact_id: string;
  artifact_type: string;
  source_operator: string;
  artifact_uri: string;
  digest: string;
  created_at: string;
  summary: Record<string, unknown>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function digestText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function artifactId(sourceOperator: string): string {
  return `obs_${sourceOperator.replace(/[^a-z0-9]+/gi, '_')}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function createObservationArtifact(options: {
  cwd: string;
  artifactType: string;
  sourceOperator: string;
  extension: string;
  content: string;
  admittedView: Record<string, unknown>;
  taskId?: string | null;
  taskNumber?: number | null;
  agentId?: string | null;
}): Promise<{ row: ObservationArtifactRow; view: ObservationView }> {
  const id = artifactId(options.sourceOperator);
  const createdAt = nowIso();
  const dir = join(options.cwd, '.ai', 'observations');
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${id}.${options.extension.replace(/^\./, '')}`);
  await writeFile(path, options.content, 'utf8');
  const digest = digestText(options.content);
  const artifactUri = relative(options.cwd, path);
  const row: ObservationArtifactRow = {
    artifact_id: id,
    artifact_type: options.artifactType,
    source_operator: options.sourceOperator,
    task_id: options.taskId ?? null,
    task_number: options.taskNumber ?? null,
    agent_id: options.agentId ?? null,
    artifact_uri: artifactUri,
    digest,
    admitted_view_json: JSON.stringify(options.admittedView),
    created_at: createdAt,
  };
  const store = openTaskLifecycleStore(options.cwd);
  try {
    store.upsertObservationArtifact(row);
  } finally {
    store.db.close();
  }
  return {
    row,
    view: {
      artifact_id: id,
      artifact_type: options.artifactType,
      source_operator: options.sourceOperator,
      artifact_uri: artifactUri,
      digest,
      created_at: createdAt,
      summary: options.admittedView,
    },
  };
}
