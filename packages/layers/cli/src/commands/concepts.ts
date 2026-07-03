import type { Command } from 'commander';
import { directCommandAction } from '../lib/command-wrapper.js';
import { emitCommandResult, resolveCommandFormat } from '../lib/cli-output.js';

type ConceptsModule = typeof import('@narada2/concepts');

let conceptsModulePromise: Promise<ConceptsModule> | null = null;

async function loadConceptsModule(): Promise<ConceptsModule> {
  if (!conceptsModulePromise) {
    conceptsModulePromise = (async () => {
      try {
        return await import('@narada2/concepts');
      } catch {
        return await import('../../../../domains/concepts/dist/index.js');
      }
    })();
  }
  return conceptsModulePromise;
}

export interface ConceptCommandOptions {
  recordsDir?: string;
  format?: string;
}

export interface ConceptLifecycleCommandOptions extends ConceptCommandOptions {
  stage?: string;
  gaps?: boolean;
}

export interface ConceptShowCommandOptions extends ConceptCommandOptions {
  query: string;
}

export async function conceptsListCommand(options: ConceptCommandOptions): Promise<{ exitCode: number; result: unknown }> {
  const { DEFAULT_CONCEPT_RECORDS_DIR, listConceptRecords, validateConceptRegistry } = await loadConceptsModule();
  const recordsDir = options.recordsDir ?? DEFAULT_CONCEPT_RECORDS_DIR;
  const validation = validateConceptRegistry({ recordsDir });
  const records = listConceptRecords({ recordsDir });
  return {
    exitCode: validation.valid ? 0 : 1,
    result: {
      schema: 'narada.concepts.registry_list.v0',
      status: validation.valid ? 'ok' : 'invalid',
      records_dir: recordsDir,
      records_count: records.length,
      records,
      validation,
    },
  };
}

export async function conceptsLifecycleCommand(options: ConceptLifecycleCommandOptions): Promise<{ exitCode: number; result: unknown }> {
  const { DEFAULT_CONCEPT_RECORDS_DIR, listConceptLifecycleGaps, listConceptLifecycleRecords, validateConceptRegistry } = await loadConceptsModule();
  const recordsDir = options.recordsDir ?? DEFAULT_CONCEPT_RECORDS_DIR;
  const validation = validateConceptRegistry({ recordsDir });
  const gaps = options.gaps ? listConceptLifecycleGaps({ recordsDir }) : [];
  const records = options.gaps ? [] : listConceptLifecycleRecords({ recordsDir, stage: options.stage as never });
  const hasGaps = options.gaps && gaps.length > 0;

  return {
    exitCode: validation.valid && !hasGaps ? 0 : 1,
    result: {
      schema: 'narada.concepts.lifecycle.v0',
      status: validation.valid && !hasGaps ? 'ok' : 'attention_required',
      records_dir: recordsDir,
      ...(options.stage ? { stage: options.stage } : {}),
      mode: options.gaps ? 'gaps' : 'records',
      records_count: records.length,
      gaps_count: gaps.length,
      records,
      gaps,
      validation,
    },
  };
}

export async function conceptsShowCommand(options: ConceptShowCommandOptions): Promise<{ exitCode: number; result: unknown }> {
  const { DEFAULT_CONCEPT_RECORDS_DIR, showConceptRecord } = await loadConceptsModule();
  const recordsDir = options.recordsDir ?? DEFAULT_CONCEPT_RECORDS_DIR;
  const resolution = showConceptRecord(options.query, { recordsDir });
  if (resolution.status !== 'found') {
    return {
      exitCode: 1,
      result: {
        schema: 'narada.concepts.registry_show.v0',
        status: resolution.status,
        query: options.query,
        records_dir: recordsDir,
        matches: resolution.matches?.map((record: { concept_id: string; canonical_name: string }) => ({ concept_id: record.concept_id, canonical_name: record.canonical_name })) ?? [],
        blocked_by: resolution.blocked_by ?? [],
      },
    };
  }

  return {
    exitCode: 0,
    result: {
      schema: 'narada.concepts.registry_show.v0',
      status: 'ok',
      query: options.query,
      records_dir: recordsDir,
      match_kind: resolution.match_kind,
      record: resolution.record,
    },
  };
}

export async function conceptsValidateCommand(options: ConceptCommandOptions): Promise<{ exitCode: number; result: unknown }> {
  const { DEFAULT_CONCEPT_RECORDS_DIR, validateConceptRegistry } = await loadConceptsModule();
  const recordsDir = options.recordsDir ?? DEFAULT_CONCEPT_RECORDS_DIR;
  const validation = validateConceptRegistry({ recordsDir });
  return {
    exitCode: validation.valid ? 0 : 1,
    result: {
      schema: 'narada.concepts.registry_validate.v0',
      status: validation.valid ? 'valid' : 'invalid',
      records_dir: recordsDir,
      validation,
    },
  };
}

export function registerConceptCommands(program: Command): void {
  const concepts = program.command('concepts').description('ConceptRegistry query and validation commands');

  concepts
    .command('list')
    .description('List seeded ConceptRecords from the canonical registry store')
    .option('--records-dir <path>', 'Override the ConceptRegistry record directory')
    .option('--format <format>', 'Output format: json, human, or auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'concepts list',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => resolveCommandFormat(opts.format, 'auto'),
      invocation: (opts) => conceptsListCommand({
        recordsDir: opts.recordsDir as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  concepts
    .command('show <query>')
    .description('Show one ConceptRecord by concept_id, canonical_name, alias, or deprecated alias')
    .option('--records-dir <path>', 'Override the ConceptRegistry record directory')
    .option('--format <format>', 'Output format: json, human, or auto', 'auto')
    .action(directCommandAction<[string, Record<string, unknown>]>({
      command: 'concepts show',
      emit: emitCommandResult,
      format: (_query: string, opts: Record<string, unknown>) => resolveCommandFormat(opts.format, 'auto'),
      invocation: (query, opts) => conceptsShowCommand({
        query,
        recordsDir: opts.recordsDir as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  concepts
    .command('validate')
    .description('Validate the ConceptRegistry store and report any structural or semantic issues')
    .option('--records-dir <path>', 'Override the ConceptRegistry record directory')
    .option('--format <format>', 'Output format: json, human, or auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'concepts validate',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => resolveCommandFormat(opts.format, 'auto'),
      invocation: (opts) => conceptsValidateCommand({
        recordsDir: opts.recordsDir as string | undefined,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));

  concepts
    .command('lifecycle')
    .description('List ConceptPromotion lifecycle records or lifecycle gaps')
    .option('--records-dir <path>', 'Override the ConceptRegistry record directory')
    .option('--stage <stage>', 'Filter lifecycle records by promotion_lifecycle.stage')
    .option('--gaps', 'Report lifecycle gaps instead of lifecycle records')
    .option('--format <format>', 'Output format: json, human, or auto', 'auto')
    .action(directCommandAction<[Record<string, unknown>]>({
      command: 'concepts lifecycle',
      emit: emitCommandResult,
      format: (opts: Record<string, unknown>) => resolveCommandFormat(opts.format, 'auto'),
      invocation: (opts) => conceptsLifecycleCommand({
        recordsDir: opts.recordsDir as string | undefined,
        stage: opts.stage as string | undefined,
        gaps: opts.gaps === true,
        format: resolveCommandFormat(opts.format, 'auto'),
      }),
    }));
}
