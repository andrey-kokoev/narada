import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { openTaskLifecycleStore } from './task-lifecycle-store.js';
import type { LawAdmissionResult } from './law-sync.js';

export type QualificationState =
  | 'qualification_current'
  | 'qualification_required'
  | 'expired'
  | 'blocked'
  | 'effectiveness_check_required';

export interface QualificationPolicyRecord {
  role_id?: string;
  principal_id?: string;
  work_class: string;
  completed_task_count_trigger?: number;
  sensitive?: boolean;
}

export interface QualificationRecord {
  qualification_id?: string;
  site_id?: string;
  principal_id: string;
  role_id?: string;
  work_classes: string[];
  status: 'qualified' | 'requalification_required' | 'suspended' | 'expired' | 'retired' | 'blocked';
  law_sources?: string[];
  context_surfaces?: string[];
  evidence_refs?: string[];
  effective_at?: string;
  expires_at?: string | null;
  issuer?: string;
  admitted_by?: string;
  completed_task_count_at_issue?: number;
  effectiveness_check_completed_task_interval?: number;
  sensitive_work_admitted?: boolean;
  receipt_command?: string;
  absorption_command?: string;
  effectiveness_check_command?: string;
}

export interface QualificationEffectivenessCheck {
  check_id: string;
  qualification_id: string;
  principal_id: string;
  role_id: string | null;
  work_class: string;
  result: 'pass' | 'fail';
  checked_at: string;
  checked_by: string;
  evidence_refs: string[];
  escalation_ref: string | null;
}

export interface QualificationEscalation {
  escalation_id: string;
  qualification_id: string;
  reason: string;
  command: string;
  created_at: string;
}

export interface QualificationConfig {
  policies?: QualificationPolicyRecord[];
  records?: QualificationRecord[];
  effectiveness_checks?: QualificationEffectivenessCheck[];
  escalations?: QualificationEscalation[];
  completed_task_count_observed?: number;
}

export interface SiteQualificationResult {
  state: QualificationState;
  required: boolean;
  work_class: string;
  principal_id: string;
  role_id: string | null;
  policy: QualificationPolicyRecord | null;
  record: QualificationRecord | null;
  completed_tasks_since_issue: number;
  blocked_work_classes: string[];
  allowed_safe_actions: string[];
  reason: string;
  commands: {
    receipt?: string;
    absorption?: string;
    effectiveness_check?: string;
    repair?: string;
  };
}

const CONFIG_PATH = join('.ai', 'site-qualification.json');

export function loadSiteQualificationConfig(cwdInput: string): QualificationConfig | null {
  const cwd = resolve(cwdInput);
  const path = join(cwd, CONFIG_PATH);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as QualificationConfig;
}

export function saveSiteQualificationConfig(cwdInput: string, config: QualificationConfig): void {
  const cwd = resolve(cwdInput);
  const path = join(cwd, CONFIG_PATH);
  mkdirSync(join(cwd, '.ai'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
}

export function upsertQualificationRecord(cwd: string, record: QualificationRecord): QualificationRecord {
  const config = loadSiteQualificationConfig(cwd) ?? {};
  const records = config.records ?? [];
  const qualificationId = record.qualification_id ?? qualificationIdFor(record.principal_id, record.role_id ?? null, record.work_classes[0] ?? 'work');
  const nextRecord: QualificationRecord = {
    ...record,
    qualification_id: qualificationId,
    effective_at: record.effective_at ?? new Date().toISOString(),
  };
  const nextRecords = records.filter((candidate) => (candidate.qualification_id ?? qualificationIdFor(candidate.principal_id, candidate.role_id ?? null, candidate.work_classes[0] ?? 'work')) !== qualificationId);
  nextRecords.push(nextRecord);
  saveSiteQualificationConfig(cwd, { ...config, records: nextRecords });
  return nextRecord;
}

export function recordQualificationEffectiveness(cwd: string, args: {
  principalId: string;
  roleId?: string | null;
  workClass: string;
  result: 'pass' | 'fail';
  checkedBy: string;
  evidenceRefs?: string[];
  escalationCommand?: string | null;
  checkedAt?: string;
}): { check: QualificationEffectivenessCheck; record: QualificationRecord; escalation: QualificationEscalation | null } {
  const config = loadSiteQualificationConfig(cwd) ?? {};
  const record = findRecord(config, args.principalId, args.roleId ?? null, args.workClass)
    ?? upsertQualificationRecord(cwd, {
      principal_id: args.principalId,
      role_id: args.roleId ?? undefined,
      work_classes: [args.workClass],
      status: 'requalification_required',
    });
  const qualificationId = record.qualification_id ?? qualificationIdFor(args.principalId, args.roleId ?? null, args.workClass);
  const checkedAt = args.checkedAt ?? new Date().toISOString();
  const check: QualificationEffectivenessCheck = {
    check_id: `qec_${safeIdPart(qualificationId)}_${Date.parse(checkedAt) || Date.now()}`,
    qualification_id: qualificationId,
    principal_id: args.principalId,
    role_id: args.roleId ?? null,
    work_class: args.workClass,
    result: args.result,
    checked_at: checkedAt,
    checked_by: args.checkedBy,
    evidence_refs: args.evidenceRefs ?? [],
    escalation_ref: null,
  };
  const updatedRecord: QualificationRecord = {
    ...record,
    qualification_id: qualificationId,
    status: args.result === 'pass' ? 'qualified' : 'blocked',
    completed_task_count_at_issue: args.result === 'pass'
      ? (typeof config.completed_task_count_observed === 'number' ? config.completed_task_count_observed : countCompletedTasks(cwd))
      : record.completed_task_count_at_issue,
  };
  let escalation: QualificationEscalation | null = null;
  if (args.result === 'fail') {
    escalation = {
      escalation_id: `qesc_${safeIdPart(qualificationId)}_${Date.parse(checkedAt) || Date.now()}`,
      qualification_id: qualificationId,
      reason: 'qualification_effectiveness_failed',
      command: args.escalationCommand ?? `narada inbox submit --kind task_candidate --topic "CAPA for failed qualification ${qualificationId}"`,
      created_at: checkedAt,
    };
    check.escalation_ref = escalation.escalation_id;
  }
  const records = (config.records ?? []).filter((candidate) => (candidate.qualification_id ?? qualificationIdFor(candidate.principal_id, candidate.role_id ?? null, candidate.work_classes[0] ?? 'work')) !== qualificationId);
  records.push(updatedRecord);
  saveSiteQualificationConfig(cwd, {
    ...config,
    records,
    effectiveness_checks: [...(config.effectiveness_checks ?? []), check],
    escalations: escalation ? [...(config.escalations ?? []), escalation] : (config.escalations ?? []),
  });
  return { check, record: updatedRecord, escalation };
}

export function evaluateSiteQualification(args: {
  cwd: string;
  principalId: string;
  roleId?: string | null;
  workClass: string;
  lawAdmission?: LawAdmissionResult;
  now?: Date;
}): SiteQualificationResult {
  const roleId = args.roleId ?? null;
  const config = loadSiteQualificationConfig(args.cwd);
  const policy = findPolicy(config, args.principalId, roleId, args.workClass);
  const record = findRecord(config, args.principalId, roleId, args.workClass);
  const completed = typeof config?.completed_task_count_observed === 'number'
    ? config.completed_task_count_observed
    : countCompletedTasks(args.cwd);
  const completedSinceIssue = Math.max(0, completed - (record?.completed_task_count_at_issue ?? completed));
  const commands = defaultCommands(args.principalId, roleId, args.workClass, record);
  const base = {
    required: Boolean(policy),
    work_class: args.workClass,
    principal_id: args.principalId,
    role_id: roleId,
    policy,
    record,
    completed_tasks_since_issue: completedSinceIssue,
    blocked_work_classes: [args.workClass],
    allowed_safe_actions: [
      `narada work-next --agent ${args.principalId} --peek --format json`,
      `narada task workboard --format json`,
      `narada law status --agent ${args.principalId}${roleId ? ` --role ${roleId}` : ''} --format json`,
    ],
    commands,
  };

  const unread = args.lawAdmission?.status === 'blocked' ? args.lawAdmission.unread : [];
  if (unread.length > 0) {
    const first = unread[0];
    return {
      ...base,
      state: 'qualification_required',
      reason: 'law_change_requires_receipt_or_absorption_before governed work admission',
      commands: {
        ...commands,
        receipt: `narada law ack ${first.change_id} --agent ${args.principalId}${roleId ? ` --role ${roleId}` : ''} --status acknowledged`,
        absorption: `narada law ack ${first.change_id} --agent ${args.principalId}${roleId ? ` --role ${roleId}` : ''} --status absorbed`,
      },
    };
  }

  if (!policy) {
    return {
      ...base,
      state: 'qualification_current',
      blocked_work_classes: [],
      reason: 'no Site qualification policy requires this work class',
    };
  }
  if (!record || record.status === 'requalification_required' || record.status === 'retired') {
    return {
      ...base,
      state: 'qualification_required',
      reason: record ? `qualification record status is ${record.status}` : 'no qualification record covers this work class',
    };
  }
  if (record.status === 'suspended' || record.status === 'blocked') {
    return {
      ...base,
      state: 'blocked',
      reason: `qualification record status is ${record.status}`,
    };
  }
  if (record.status === 'expired' || isExpired(record.expires_at, args.now ?? new Date())) {
    return {
      ...base,
      state: 'expired',
      reason: 'qualification expired',
    };
  }
  if (policy.sensitive === true && record.sensitive_work_admitted !== true) {
    return {
      ...base,
      state: 'blocked',
      reason: 'sensitive work requires explicit qualification admission',
    };
  }
  const interval = record.effectiveness_check_completed_task_interval ?? policy.completed_task_count_trigger ?? 0;
  if (interval > 0 && completedSinceIssue >= interval) {
    return {
      ...base,
      state: 'effectiveness_check_required',
      reason: `completed-task-count trigger reached: ${completedSinceIssue}/${interval}`,
    };
  }
  return {
    ...base,
    state: 'qualification_current',
    blocked_work_classes: [],
    reason: 'qualification current for governed work class',
  };
}

export function qualificationBlocksGovernedWork(result: SiteQualificationResult): boolean {
  return result.state !== 'qualification_current';
}

function findPolicy(config: QualificationConfig | null, principalId: string, roleId: string | null, workClass: string): QualificationPolicyRecord | null {
  return (config?.policies ?? []).find((policy) =>
    policy.work_class === workClass
    && (!policy.principal_id || policy.principal_id === principalId)
    && (!policy.role_id || policy.role_id === roleId)
  ) ?? null;
}

function findRecord(config: QualificationConfig | null, principalId: string, roleId: string | null, workClass: string): QualificationRecord | null {
  return (config?.records ?? []).find((record) =>
    record.principal_id === principalId
    && (!record.role_id || !roleId || record.role_id === roleId)
    && record.work_classes.includes(workClass)
  ) ?? null;
}

function countCompletedTasks(cwd: string): number {
  let store: ReturnType<typeof openTaskLifecycleStore>;
  try {
    store = openTaskLifecycleStore(cwd);
  } catch {
    return 0;
  }
  try {
    return store.getAllLifecycle().filter((row) => row.status === 'closed' || row.status === 'confirmed').length;
  } finally {
    store.db.close();
  }
}

function isExpired(value: string | null | undefined, now: Date): boolean {
  if (!value) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= now.getTime();
}

function defaultCommands(
  principalId: string,
  roleId: string | null,
  workClass: string,
  record: QualificationRecord | null,
): SiteQualificationResult['commands'] {
  const role = roleId ? ` --role ${roleId}` : '';
  return {
    receipt: record?.receipt_command ?? `narada law status --agent ${principalId}${role} --format json`,
    absorption: record?.absorption_command ?? `narada law unread --agent ${principalId}${role} --format json`,
    effectiveness_check: record?.effectiveness_check_command ?? `narada qualification effectiveness-check --agent ${principalId}${role} --work-class ${workClass}`,
    repair: `narada qualification status --agent ${principalId}${role} --work-class ${workClass} --format json`,
  };
}

function qualificationIdFor(principalId: string, roleId: string | null, workClass: string): string {
  return `qual_${safeIdPart(principalId)}_${safeIdPart(roleId ?? 'role')}_${safeIdPart(workClass)}`;
}

function safeIdPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'x';
}
