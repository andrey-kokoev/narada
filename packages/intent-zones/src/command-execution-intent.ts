/**
 * Command Execution Intent Zone types.
 *
 * CEIZ is the governed non-test command execution boundary. These types define
 * durable request/result artifacts; they do not execute commands.
 */

export type CommandRequesterKind = 'operator' | 'agent' | 'system';

export type CommandEnvPolicy =
  | { mode: 'inherit' }
  | { mode: 'allowlist'; names: string[] }
  | { mode: 'empty' };

export type CommandStdinPolicy =
  | { mode: 'none' }
  | { mode: 'inline'; digest: string }
  | { mode: 'artifact'; artifact_uri: string; digest: string };

export type CommandSideEffectClass =
  | 'read_only'
  | 'workspace_write'
  | 'external_write'
  | 'network'
  | 'process_control'
  | 'long_running_server'
  | 'gui_open'
  | 'destructive';

export type CommandApprovalPosture =
  | 'not_required'
  | 'required'
  | 'approved'
  | 'rejected';

export type CommandOutputAdmissionProfile =
  | 'digest_only'
  | 'bounded_excerpt'
  | 'artifact_retained';

export type CommandRunStatus =
  | 'requested'
  | 'rejected'
  | 'approved'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'timed_out'
  | 'cancelled'
  | 'blocked_by_policy';

export interface CommandRunRequest {
  run_id: string;
  request_id: string;
  requester_id: string;
  requester_kind: CommandRequesterKind;
  command_argv: string[];
  cwd: string;
  env_policy: CommandEnvPolicy;
  timeout_seconds: number;
  stdin_policy: CommandStdinPolicy;
  task_id: string | null;
  task_number: number | null;
  agent_id: string | null;
  side_effect_class: CommandSideEffectClass;
  approval_posture: CommandApprovalPosture;
  output_admission_profile: CommandOutputAdmissionProfile;
  idempotency_key: string;
  requested_at: string;
  rationale: string | null;
}

export interface CommandRunResult {
  run_id: string;
  request_id: string;
  status: CommandRunStatus;
  exit_code: number | null;
  signal: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  stdout_digest: string | null;
  stderr_digest: string | null;
  stdout_admitted_excerpt: string | null;
  stderr_admitted_excerpt: string | null;
  full_output_artifact_uri: string | null;
  error_class: string | null;
  approval_outcome: CommandApprovalPosture;
  telemetry_json: string | null;
}

export interface CommandRunRow extends CommandRunRequest, CommandRunResult {
  command_argv_json: string;
  env_policy_json: string;
  stdin_policy_json: string;
  updated_at: string;
}

export interface CommandExecutionRegime {
  side_effect_class: CommandSideEffectClass;
  default_timeout_seconds: number;
  max_timeout_seconds: number;
  requires_approval: boolean;
  shell_mode_allowed: boolean;
  cancellation_grace_ms: number;
}

export function defaultCommandTimeout(sideEffectClass: CommandSideEffectClass): number {
  switch (sideEffectClass) {
    case 'read_only':
      return 30;
    case 'workspace_write':
      return 120;
    case 'network':
    case 'external_write':
      return 180;
    case 'process_control':
    case 'long_running_server':
    case 'gui_open':
      return 300;
    case 'destructive':
      return 60;
  }
}

export function maxCommandTimeout(sideEffectClass: CommandSideEffectClass): number {
  switch (sideEffectClass) {
    case 'read_only':
      return 120;
    case 'workspace_write':
      return 600;
    case 'network':
    case 'external_write':
      return 900;
    case 'process_control':
    case 'long_running_server':
      return 3600;
    case 'gui_open':
      return 300;
    case 'destructive':
      return 300;
  }
}

export function commandRequiresApproval(sideEffectClass: CommandSideEffectClass): boolean {
  return sideEffectClass !== 'read_only' && sideEffectClass !== 'workspace_write';
}

export function commandShellModeAllowed(sideEffectClass: CommandSideEffectClass): boolean {
  return sideEffectClass !== 'destructive';
}

export function buildCommandExecutionRegime(sideEffectClass: CommandSideEffectClass): CommandExecutionRegime {
  return {
    side_effect_class: sideEffectClass,
    default_timeout_seconds: defaultCommandTimeout(sideEffectClass),
    max_timeout_seconds: maxCommandTimeout(sideEffectClass),
    requires_approval: commandRequiresApproval(sideEffectClass),
    shell_mode_allowed: commandShellModeAllowed(sideEffectClass),
    cancellation_grace_ms: 5000,
  };
}

export function commandRequestIdempotencyKey(input: {
  requester_id: string;
  command_argv: string[];
  cwd: string;
  task_id: string | null;
  side_effect_class: CommandSideEffectClass;
}): string {
  return [
    input.requester_id,
    input.cwd,
    input.task_id ?? '',
    input.side_effect_class,
    ...input.command_argv,
  ].join('\u001f');
}
