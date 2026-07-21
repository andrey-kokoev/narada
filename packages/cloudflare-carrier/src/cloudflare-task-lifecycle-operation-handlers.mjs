import { defineCloudflareProductContextOperations } from './cloudflare-product-operation-context.mjs';

const TASK_LIFECYCLE_OPERATION_NAMES = [
  'task_lifecycle.write_admission.classify',
  'task_lifecycle.write_admission.list',
  'task_lifecycle.task_create.admit',
  'task_lifecycle.task_claim.admit',
  'task_lifecycle.task_report.admit',
  'task_lifecycle.task_finish.admit',
  'task_lifecycle.changed_file_evidence.admit',
  'task_lifecycle.projection_write.admit',
  'task_lifecycle.source_state_write.admit',
  'task_lifecycle.assignment_write.admit',
  'task_lifecycle.role_resolution_write.admit',
  'task_lifecycle.roster_mutation_write.admit',
  'task_lifecycle.task.list',
];

export function createCloudflareTaskLifecycleOperationHandlers({ dispatch } = {}) {
  return defineCloudflareProductContextOperations({
    bounded_context: 'task-lifecycle',
    authority: 'task-lifecycle-admission',
    operations: TASK_LIFECYCLE_OPERATION_NAMES,
    dispatch,
  });
}

export const CLOUDFLARE_TASK_LIFECYCLE_OPERATION_NAMES = Object.freeze([...TASK_LIFECYCLE_OPERATION_NAMES]);
