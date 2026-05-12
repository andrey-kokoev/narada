import { createHash } from 'node:crypto';
import {
  DeniedSourceImportError,
  assertNeutralIdentities,
  findDeniedSourceImports,
} from './import-refusal.js';
import { decideTaskDbAdapterBoundary } from './task-db-adapter.js';
import type {
  TaskAdmissionWriteOperation,
  TaskAdmissionWriteRequest,
  TaskAdmissionWriteRequestOptions,
  TaskAdmissionWriteResult,
} from './types.js';

export class TaskCandidateNotPendingAdmissionError extends Error {
  constructor(taskId: string) {
    super(`Task candidate is not pending admission: ${taskId}`);
    this.name = 'TaskCandidateNotPendingAdmissionError';
  }
}

export function buildTaskAdmissionWriteRequest(
  options: TaskAdmissionWriteRequestOptions,
): TaskAdmissionWriteRequest {
  if (options.candidate.status !== 'pending_admission') {
    throw new TaskCandidateNotPendingAdmissionError(options.candidate.taskId);
  }

  assertNeutralIdentities([options.admittedBy]);
  const sourceFindings = findDeniedSourceImports(options.candidate.evidenceRefs);
  if (sourceFindings.length > 0) {
    throw new DeniedSourceImportError(sourceFindings);
  }

  const adapterBoundary = decideTaskDbAdapterBoundary();
  return {
    schema: 'narada.site_task_lifecycle.task_admission_write_request.v0',
    taskDbPath: options.taskDbPath,
    candidate: options.candidate,
    admittedBy: options.admittedBy,
    admittedAt: options.admittedAt,
    adapterDecision: adapterBoundary.decision,
    adapterCapabilitiesRequired: adapterBoundary.requiredAdapterCapabilities,
    operations: buildTaskAdmissionWriteOperations(options),
  };
}

export function buildTaskAdmissionWriteResult(
  request: TaskAdmissionWriteRequest,
  adapterId: string,
  recordedAt: string,
): TaskAdmissionWriteResult {
  return {
    schema: 'narada.site_task_lifecycle.task_admission_write_result.v0',
    taskId: request.candidate.taskId,
    taskDbPath: request.taskDbPath,
    status: 'ready_for_adapter',
    adapterId,
    operationCount: request.operations.length,
    mutationExecutedByPackage: false,
    recordedAt,
  };
}

function buildTaskAdmissionWriteOperations(
  options: TaskAdmissionWriteRequestOptions,
): TaskAdmissionWriteOperation[] {
  const eventId = createHash('sha256')
    .update(`${options.candidate.taskId}\n${options.admittedAt}\n${options.admittedBy.identityId}`)
    .digest('hex')
    .slice(0, 16);

  return [
    {
      kind: 'insert_task_record',
      description: 'Insert admitted task record through the receiving-Site adapter.',
      parameters: {
        task_id: options.candidate.taskId,
        title: options.candidate.title,
        source_site: options.candidate.sourceSite,
        source_ref: options.candidate.sourceRef,
        status: 'admitted',
        received_at: options.candidate.receivedAt,
        summary: options.candidate.summary,
        created_at: options.admittedAt,
      },
    },
    ...options.candidate.evidenceRefs.map((evidenceRef) => ({
      kind: 'insert_evidence_ref' as const,
      description: 'Attach admitted evidence reference through the receiving-Site adapter.',
      parameters: {
        task_id: options.candidate.taskId,
        evidence_ref: evidenceRef,
        evidence_kind: evidenceRef.startsWith('OSM:') ? 'operator_surface_message' : 'external_reference',
      },
    })),
    {
      kind: 'record_admission_event',
      description: 'Record local task admission event through the receiving-Site adapter.',
      parameters: {
        event_id: `task-admission-${eventId}`,
        task_id: options.candidate.taskId,
        event_type: 'task_admitted',
        recorded_at: options.admittedAt,
        payload_json: JSON.stringify({
          admittedBy: options.admittedBy.identityId,
          sourceRef: options.candidate.sourceRef,
        }),
      },
    },
  ];
}
