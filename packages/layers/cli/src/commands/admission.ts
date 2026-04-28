import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import {
  admissionLedgerPath,
  makeAdmissionLedgerEntry,
  parseAdmissionDecision,
  parseCsv,
  readAdmissionLedger,
  writeAdmissionLedger,
} from '../lib/admission-rejection-ledger.js';

export interface AdmissionRecordOptions {
  cwd?: string;
  candidateId?: string;
  sourceKind?: string;
  sourceRef?: string;
  candidateKind?: string;
  decision?: string;
  reasons?: string;
  evidenceRefs?: string;
  by?: string;
  systemRule?: string;
  authorityLevel?: string;
  resultingEnvelopeId?: string;
  supersedes?: string;
  retryOf?: string;
  observedAt?: string;
  format?: string;
}

export interface AdmissionListOptions {
  cwd?: string;
  sourceKind?: string;
  candidateKind?: string;
  decision?: string;
  limit?: number;
  format?: string;
}

export interface AdmissionExplainOptions {
  cwd?: string;
  decisionId?: string;
  format?: string;
}

function requireOption(value: string | undefined, name: string): string {
  if (!value?.trim()) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function normalizeError(error: unknown): { exitCode: ExitCode; result: unknown } {
  const message = error instanceof Error ? error.message : String(error);
  return { exitCode: ExitCode.INVALID_CONFIG, result: { status: 'error', error: message } };
}

export async function admissionRecordCommand(
  options: AdmissionRecordOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  try {
    const cwd = options.cwd ?? '.';
    const decision = parseAdmissionDecision(options.decision);
    const entry = makeAdmissionLedgerEntry({
      candidateId: requireOption(options.candidateId, '--candidate-id'),
      sourceKind: requireOption(options.sourceKind, '--source-kind'),
      sourceRef: requireOption(options.sourceRef, '--source-ref'),
      candidateKind: requireOption(options.candidateKind, '--candidate-kind'),
      decision,
      reasonCodes: parseCsv(options.reasons),
      evidenceRefs: parseCsv(options.evidenceRefs),
      decidedBy: requireOption(options.by, '--by'),
      systemRule: options.systemRule,
      authorityLevel: options.authorityLevel ?? 'operator_confirmed',
      resultingEnvelopeId: options.resultingEnvelopeId,
      supersedes: options.supersedes,
      retryOf: options.retryOf,
      observedAt: options.observedAt,
    });
    if (decision === 'admitted' && !entry.resulting_envelope_id) {
      throw new Error('--resulting-envelope-id is required when decision is admitted');
    }
    if (entry.reason_codes.length === 0) {
      throw new Error('--reasons must include at least one reason code');
    }
    const ledger = await readAdmissionLedger(cwd);
    ledger.entries.push(entry);
    const path = await writeAdmissionLedger(cwd, ledger);
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        mutation_performed: true,
        ledger_path: path,
        entry,
        raw_payload_stored: false,
      },
    };
  } catch (error) {
    return normalizeError(error);
  }
}

export async function admissionListCommand(
  options: AdmissionListOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ?? '.';
  const limit = options.limit ?? 20;
  const ledger = await readAdmissionLedger(cwd);
  const entries = ledger.entries
    .filter((entry) => !options.sourceKind || entry.source_kind === options.sourceKind)
    .filter((entry) => !options.candidateKind || entry.candidate_kind === options.candidateKind)
    .filter((entry) => !options.decision || entry.decision === options.decision)
    .slice(0, limit);
  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      mutation_performed: false,
      ledger_path: admissionLedgerPath(cwd),
      count: entries.length,
      limit,
      entries,
    },
  };
}

export async function admissionExplainCommand(
  options: AdmissionExplainOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const decisionId = requireOption(options.decisionId, '<decision-id>');
  const cwd = options.cwd ?? '.';
  const ledger = await readAdmissionLedger(cwd);
  const entry = ledger.entries.find((candidate) => candidate.decision_id === decisionId);
  if (!entry) {
    return {
      exitCode: ExitCode.INVALID_CONFIG,
      result: { status: 'error', error: `Admission decision not found: ${decisionId}` },
    };
  }
  const outcome = entry.decision === 'admitted'
    ? `Candidate was admitted as ${entry.resulting_envelope_id}.`
    : entry.decision === 'rejected'
      ? 'Candidate was rejected and should not silently re-enter without new evidence.'
      : entry.decision === 'deferred'
        ? 'Candidate was deferred; retry or supersession should link back to this decision.'
        : `Candidate superseded ${entry.supersedes ?? 'another candidate'}.`;
  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      mutation_performed: false,
      ledger_path: admissionLedgerPath(cwd),
      entry,
      outcome,
      raw_payload_stored: false,
    },
  };
}
