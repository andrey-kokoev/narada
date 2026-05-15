import { runNaradaJson, type CommandEnvelope } from './process.js';

export interface InboxCommandOptions {
  cwd: string;
  format?: string;
  status?: string;
  kind?: string;
  limit?: number;
  claim?: boolean;
  by?: string;
  envelopeId?: string;
  sourceRef?: string;
  title?: string;
  summary?: string;
  sourceKind?: string;
  authorityLevel?: string;
  principal?: string;
  targetLocus?: string;
  evidence?: string[];
  proposal?: string[];
  recommendation?: string;
}

export async function inboxDoctorCommand(options: InboxCommandOptions): Promise<CommandEnvelope> {
  return runNaradaJson(['inbox', 'doctor'], options.cwd);
}

export async function inboxWorkNextCommand(options: InboxCommandOptions): Promise<CommandEnvelope> {
  return runNaradaJson([
    'inbox',
    'work-next',
    ...optional('--status', options.status),
    ...optional('--kind', options.kind),
    ...optional('--limit', options.limit),
    ...(options.claim ? ['--claim'] : []),
    ...optional('--by', options.by),
  ], options.cwd);
}

export async function inboxListCommand(options: InboxCommandOptions): Promise<CommandEnvelope> {
  return runNaradaJson([
    'inbox',
    'list',
    ...optional('--status', options.status),
    ...optional('--kind', options.kind),
    ...optional('--limit', options.limit),
  ], options.cwd);
}

export async function inboxShowCommand(options: InboxCommandOptions): Promise<CommandEnvelope> {
  return runNaradaJson(['inbox', 'show', options.envelopeId ?? ''], options.cwd);
}

export async function inboxSubmitObservationCommand(options: InboxCommandOptions): Promise<CommandEnvelope> {
  return runNaradaJson([
    'inbox',
    'submit-observation',
    ...optional('--source-ref', options.sourceRef),
    ...optional('--title', options.title),
    ...optional('--summary', options.summary),
    ...optional('--source-kind', options.sourceKind),
    ...optional('--authority-level', options.authorityLevel),
    ...optional('--principal', options.principal),
    ...optional('--target-locus', options.targetLocus),
    ...repeat('--evidence', options.evidence),
    ...repeat('--proposal', options.proposal),
    ...optional('--recommendation', options.recommendation),
  ], options.cwd);
}

function optional(flag: string, value: string | number | undefined): string[] {
  return value === undefined ? [] : [flag, String(value)];
}

function repeat(flag: string, values: string[] | undefined): string[] {
  return values?.flatMap((value) => [flag, value]) ?? [];
}
