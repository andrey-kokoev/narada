import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export type AdmissionDecision = 'admitted' | 'rejected' | 'deferred' | 'superseded';

export interface AdmissionLedgerEntry {
  decision_id: string;
  candidate_id: string;
  source_kind: string;
  source_ref: string;
  candidate_kind: string;
  decision: AdmissionDecision;
  reason_codes: string[];
  evidence_refs: string[];
  decided_by: string;
  system_rule: string | null;
  authority_level: string;
  resulting_envelope_id: string | null;
  supersedes: string | null;
  retry_of: string | null;
  observed_at: string | null;
  decided_at: string;
}

export interface AdmissionRejectionLedger {
  ledger_kind: 'admission_rejection_ledger';
  ledger_version: 1;
  entries: AdmissionLedgerEntry[];
}

const DECISIONS = new Set<AdmissionDecision>(['admitted', 'rejected', 'deferred', 'superseded']);

export function admissionLedgerPath(cwd: string): string {
  return join(resolve(cwd), '.ai', 'admission-rejection-ledger.json');
}

function emptyLedger(): AdmissionRejectionLedger {
  return {
    ledger_kind: 'admission_rejection_ledger',
    ledger_version: 1,
    entries: [],
  };
}

export async function readAdmissionLedger(cwd: string): Promise<AdmissionRejectionLedger> {
  const path = admissionLedgerPath(cwd);
  if (!existsSync(path)) return emptyLedger();
  const parsed = JSON.parse(await readFile(path, 'utf8')) as AdmissionRejectionLedger;
  return {
    ledger_kind: 'admission_rejection_ledger',
    ledger_version: 1,
    entries: Array.isArray(parsed.entries) ? parsed.entries : [],
  };
}

export async function writeAdmissionLedger(cwd: string, ledger: AdmissionRejectionLedger): Promise<string> {
  const path = admissionLedgerPath(cwd);
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
  await rename(tempPath, path);
  return path;
}

export function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(',').map((part) => part.trim()).filter(Boolean);
}

export function parseAdmissionDecision(value: string | undefined): AdmissionDecision {
  if (!DECISIONS.has(value as AdmissionDecision)) {
    throw new Error(`Unsupported admission decision: "${value ?? ''}". Valid decisions: ${[...DECISIONS].join(', ')}`);
  }
  return value as AdmissionDecision;
}

export function makeAdmissionLedgerEntry(args: {
  candidateId: string;
  sourceKind: string;
  sourceRef: string;
  candidateKind: string;
  decision: AdmissionDecision;
  reasonCodes: string[];
  evidenceRefs: string[];
  decidedBy: string;
  systemRule?: string | null;
  authorityLevel: string;
  resultingEnvelopeId?: string | null;
  supersedes?: string | null;
  retryOf?: string | null;
  observedAt?: string | null;
  now?: Date;
}): AdmissionLedgerEntry {
  return {
    decision_id: `adm_${randomUUID()}`,
    candidate_id: args.candidateId,
    source_kind: args.sourceKind,
    source_ref: args.sourceRef,
    candidate_kind: args.candidateKind,
    decision: args.decision,
    reason_codes: args.reasonCodes,
    evidence_refs: args.evidenceRefs,
    decided_by: args.decidedBy,
    system_rule: args.systemRule ?? null,
    authority_level: args.authorityLevel,
    resulting_envelope_id: args.resultingEnvelopeId ?? null,
    supersedes: args.supersedes ?? null,
    retry_of: args.retryOf ?? null,
    observed_at: args.observedAt ?? null,
    decided_at: (args.now ?? new Date()).toISOString(),
  };
}
