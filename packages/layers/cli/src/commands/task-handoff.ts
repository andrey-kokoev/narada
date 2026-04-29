import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { SqliteInboxStore, type InboxEnvelope } from '@narada2/control-plane';
import { ExitCode } from '../lib/exit-codes.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { openTaskLifecycleStore } from '../lib/task-projection.js';
import {
  inboxEnvelopeToEvidenceState,
  writeInboxMutationEvidence,
} from '../lib/inbox-mutation-evidence-writer.js';
import { taskReadCommand, type TaskReadResult } from './task-read.js';

export interface TaskHandoffOptions {
  taskNumber: string;
  cwd?: string;
  format?: CliFormat;
  artifact?: boolean;
  artifactPath?: string;
  routeInbox?: boolean;
  by?: string;
}

export interface TaskHandoffPacket {
  packet_id: string;
  packet_type: 'task_handoff';
  generated_at: string;
  generated_by: string | null;
  task: {
    task_id: string;
    task_number: number | null;
    title: string;
    status: string | undefined;
    goal: string | null;
    context_summary: string | null;
    acceptance_criteria: Array<{ text: string; checked: boolean }>;
    dependencies: number[];
    assignment: TaskReadResult['assignment'];
  };
  source_envelopes: Array<{
    envelope_id: string;
    kind: string;
    status: string;
    source_kind: string;
    source_ref: string;
    target_ref: string | null;
  }>;
  changed_loci: string[];
  verification_expectations: string[];
  residuals: string[];
  return_review_path: {
    command: string;
    report_command: string;
    review_command: string;
  };
  output_bounds: {
    full_task_body_included: false;
    full_inbox_payloads_included: false;
    max_source_envelopes: number;
  };
}

const SOURCE_ENVELOPE_LIMIT = 10;

export async function taskHandoffCommand(
  options: TaskHandoffOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const read = await taskReadCommand({
    cwd,
    taskNumber: options.taskNumber,
    format: 'json',
  });
  if (read.exitCode !== ExitCode.SUCCESS) return read;

  const task = (read.result as { task: TaskReadResult }).task;
  const packet = await buildTaskHandoffPacket(cwd, task, options.by ?? null);
  let artifactPath: string | null = null;
  if (options.artifact || options.artifactPath) {
    artifactPath = await writeHandoffArtifact(cwd, packet, options.artifactPath);
  }

  let inboxEnvelope: InboxEnvelope | null = null;
  if (options.routeInbox) {
    const store = new SqliteInboxStore(join(cwd, '.ai', 'inbox.db'));
    try {
      inboxEnvelope = store.insert({
        envelope_id: `env_${randomUUID()}`,
        received_at: new Date().toISOString(),
        source: {
          kind: 'cli',
          ref: `narada task handoff ${task.task_number ?? options.taskNumber}`,
        },
        kind: 'observation',
        authority: {
          level: options.by ? 'agent_reported' : 'system_observed',
          ...(options.by ? { principal: options.by } : {}),
        },
        payload: {
          packet_type: 'task_handoff',
          packet,
          note: 'Canonical Inbox currently has no review_request or handoff kind; routed as observation.',
        },
      });
      await writePortableInboxEnvelope(cwd, inboxEnvelope);
      await writeInboxMutationEvidence({
        cwd,
        command: 'task handoff route-inbox',
        principal: options.by,
        authorityClass: 'claim',
        before: null,
        after: inboxEnvelopeToEvidenceState(inboxEnvelope),
        result: {
          status: 'success',
          envelope_id: inboxEnvelope.envelope_id,
          task_number: task.task_number,
          packet_id: packet.packet_id,
          route_kind: inboxEnvelope.kind,
        },
      });
    } finally {
      store.close();
    }
  }

  const result = {
    status: 'success',
    packet,
    artifact_path: artifactPath ? relative(cwd, artifactPath) : null,
    inbox_envelope_id: inboxEnvelope?.envelope_id ?? null,
    route_kind: inboxEnvelope ? 'observation' : null,
  };

  return {
    exitCode: ExitCode.SUCCESS,
    result: formattedResult(result, renderHuman(result), options.format ?? 'auto'),
  };
}

async function writePortableInboxEnvelope(cwd: string, envelope: InboxEnvelope): Promise<string> {
  const outDir = resolve(cwd, '.ai', 'inbox-envelopes');
  await mkdir(outDir, { recursive: true });
  const fileName = `${envelope.received_at.replace(/[:.]/g, '-')}-${envelope.envelope_id}.json`;
  const path = join(outDir, fileName);
  await writeFile(path, `${JSON.stringify(envelope, null, 2)}\n`, 'utf8');
  return path;
}

async function buildTaskHandoffPacket(
  cwd: string,
  task: TaskReadResult,
  generatedBy: string | null,
): Promise<TaskHandoffPacket> {
  const changedLoci = await readChangedLoci(cwd, task.task_id);
  const sourceEnvelopes = readSourceEnvelopes(cwd, task.task_number);
  const reportCommand = `narada task report ${task.task_number ?? '<task>'} --agent ${task.assignment?.agent_id ?? '<builder>'} --summary <summary> --verification <json>`;
  const reviewCommand = `narada task review ${task.task_number ?? '<task>'} --agent <reviewer> --verdict accepted --report <report-id> --findings '[]'`;

  return {
    packet_id: `thp_${randomUUID()}`,
    packet_type: 'task_handoff',
    generated_at: new Date().toISOString(),
    generated_by: generatedBy,
    task: {
      task_id: task.task_id,
      task_number: task.task_number,
      title: task.title,
      status: task.status,
      goal: task.goal,
      context_summary: summarize(task.context, 500),
      acceptance_criteria: task.acceptance_criteria,
      dependencies: task.dependencies,
      assignment: task.assignment,
    },
    source_envelopes: sourceEnvelopes,
    changed_loci: changedLoci,
    verification_expectations: [
      'Run focused tests covering the changed behavior.',
      'Run pnpm verify before reporting completion.',
      'Record verification commands and results in task report evidence.',
    ],
    residuals: task.warnings,
    return_review_path: {
      command: reviewCommand,
      report_command: reportCommand,
      review_command: reviewCommand,
    },
    output_bounds: {
      full_task_body_included: false,
      full_inbox_payloads_included: false,
      max_source_envelopes: SOURCE_ENVELOPE_LIMIT,
    },
  };
}

async function readChangedLoci(cwd: string, taskId: string): Promise<string[]> {
  const store = await openTaskLifecycleStore(cwd);
  if (!store) return [];
  try {
    const files = new Set<string>();
    for (const report of store.listReports(taskId)) {
      try {
        const changed = JSON.parse(report.changed_files_json ?? '[]') as unknown;
        if (Array.isArray(changed)) {
          for (const file of changed) {
            if (typeof file === 'string' && file.trim()) files.add(file.trim());
          }
        }
      } catch {
        // Ignore malformed historical report payloads.
      }
    }
    return [...files].sort();
  } finally {
    store.db.close();
  }
}

function readSourceEnvelopes(
  cwd: string,
  taskNumber: number | null,
): TaskHandoffPacket['source_envelopes'] {
  if (taskNumber === null) return [];
  const store = new SqliteInboxStore(join(cwd, '.ai', 'inbox.db'));
  try {
    return store
      .list({ limit: 200 })
      .filter((envelope) => envelope.promotion?.target_kind === 'task')
      .filter((envelope) => envelope.promotion?.target_ref === `task:${taskNumber}`)
      .slice(0, SOURCE_ENVELOPE_LIMIT)
      .map((envelope) => ({
        envelope_id: envelope.envelope_id,
        kind: envelope.kind,
        status: envelope.status,
        source_kind: envelope.source.kind,
        source_ref: envelope.source.ref,
        target_ref: envelope.promotion?.target_ref ?? null,
      }));
  } finally {
    store.close();
  }
}

async function writeHandoffArtifact(
  cwd: string,
  packet: TaskHandoffPacket,
  artifactPath?: string,
): Promise<string> {
  const path = resolve(cwd, artifactPath ?? join('.ai', 'handoffs', `task-${packet.task.task_number ?? 'unknown'}-handoff.json`));
  await mkdir(resolve(path, '..'), { recursive: true });
  await writeFile(path, `${JSON.stringify(packet, null, 2)}\n`, 'utf8');
  return path;
}

function summarize(text: string | null, maxChars: number): string | null {
  if (!text) return null;
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars - 1)}…`;
}

function renderHuman(result: {
  packet: TaskHandoffPacket;
  artifact_path: string | null;
  inbox_envelope_id: string | null;
  route_kind: string | null;
}): string[] {
  const packet = result.packet;
  const lines = [
    `Task handoff packet: ${packet.task.task_number ?? packet.task.task_id}`,
    `Title: ${packet.task.title}`,
    `Status: ${packet.task.status ?? 'unknown'}`,
    `Assigned: ${packet.task.assignment?.agent_id ?? 'unassigned'}`,
    `Criteria: ${packet.task.acceptance_criteria.length}`,
    `Dependencies: ${packet.task.dependencies.length > 0 ? packet.task.dependencies.join(', ') : 'none'}`,
    `Source envelopes: ${packet.source_envelopes.length}`,
    `Changed loci: ${packet.changed_loci.length}`,
    `Artifact: ${result.artifact_path ?? 'not written'}`,
    `Inbox route: ${result.inbox_envelope_id ? `${result.inbox_envelope_id} (${result.route_kind})` : 'not routed'}`,
    `Return review: ${packet.return_review_path.review_command}`,
  ];
  return lines;
}
