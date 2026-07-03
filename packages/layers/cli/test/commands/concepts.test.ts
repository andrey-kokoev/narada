import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const conceptModule = vi.hoisted(() => ({
  DEFAULT_CONCEPT_RECORDS_DIR: '/mock/concepts',
  listConceptLifecycleGaps: vi.fn(),
  listConceptLifecycleRecords: vi.fn(),
  listConceptRecords: vi.fn(),
  showConceptRecord: vi.fn(),
  validateConceptRegistry: vi.fn(),
}));

vi.mock('@narada2/concepts', () => conceptModule);

import {
  conceptsLifecycleCommand,
  conceptsListCommand,
  conceptsShowCommand,
  conceptsValidateCommand,
  registerConceptCommands,
} from '../../src/commands/concepts.js';

function createRecord(conceptId: string, canonicalName: string) {
  return {
    concept_id: conceptId,
    canonical_name: canonicalName,
    kind: 'policy',
    status: 'draft',
    owner_surface: '@narada2/site-operating-loop package',
    aliases: [],
    deprecated_aliases: [],
    confidence: { cl: 0.98, basis: 'fixture' },
    reviewed_at: '2026-07-02T00:00:00.000Z',
  };
}

describe('concepts commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    conceptModule.listConceptRecords.mockReturnValue([
      createRecord('loop_definition', 'LoopDefinition'),
      createRecord('watch_definition', 'WatchDefinition'),
    ]);
    conceptModule.listConceptLifecycleRecords.mockReturnValue([
      { ...createRecord('concept_promotion', 'ConceptPromotion'), lifecycle_stage: 'active' },
    ]);
    conceptModule.listConceptLifecycleGaps.mockReturnValue([
      {
        code: 'active_concept_missing_promotion_lifecycle',
        message: 'Active concepts should carry a source-controlled ConceptPromotion lifecycle record.',
        concept_id: 'concept',
        canonical_name: 'Concept',
        status: 'active',
        field: 'promotion_lifecycle',
      },
    ]);
    conceptModule.validateConceptRegistry.mockReturnValue({ valid: true, files_count: 2, records_count: 2, issues: [] });
    conceptModule.showConceptRecord.mockReturnValue({
      query: 'ProjectionTopology',
      status: 'found',
      match_kind: 'canonical_name',
      record: {
        ...createRecord('projection_topology', 'ProjectionTopology'),
        short_definition: 'The canonical topology describing authority runtimes, projection stores, projection surfaces, and intent routes.',
        description: 'Projection topology record fixture.',
        boundaries: [],
        relations: [],
        authority: { kind: 'documentation', ref: 'docs/concepts/narada-runtime-projection-graph.md' },
        schemas: [],
        docs: [],
        tasks: [],
        code_refs: [],
        tests: [],
        examples: [],
        counterexamples: [],
        open_questions: [],
      },
    });
  });

  it('registers the concepts command group', () => {
    const program = new Command();
    registerConceptCommands(program);

    const concepts = program.commands.find((command) => command.name() === 'concepts');
    expect(concepts).toBeDefined();
    expect(concepts?.commands.map((command) => command.name())).toEqual(expect.arrayContaining(['list', 'show', 'validate', 'lifecycle']));
  });

  it('lists concepts from the registry surface', async () => {
    const result = await conceptsListCommand({});

    expect(result.exitCode).toBe(0);
    expect(result.result).toMatchObject({
      schema: 'narada.concepts.registry_list.v0',
      status: 'ok',
      records_dir: '/mock/concepts',
      records_count: 2,
      records: [
        createRecord('loop_definition', 'LoopDefinition'),
        createRecord('watch_definition', 'WatchDefinition'),
      ],
    });
    expect(conceptModule.validateConceptRegistry).toHaveBeenCalledWith({ recordsDir: '/mock/concepts' });
    expect(conceptModule.listConceptRecords).toHaveBeenCalledWith({ recordsDir: '/mock/concepts' });
  });

  it('shows a matching concept record', async () => {
    const result = await conceptsShowCommand({ query: 'ProjectionTopology' });

    expect(result.exitCode).toBe(0);
    expect(result.result).toMatchObject({
      schema: 'narada.concepts.registry_show.v0',
      status: 'ok',
      query: 'ProjectionTopology',
      records_dir: '/mock/concepts',
      match_kind: 'canonical_name',
      record: expect.objectContaining({
        concept_id: 'projection_topology',
        canonical_name: 'ProjectionTopology',
      }),
    });
    expect(conceptModule.showConceptRecord).toHaveBeenCalledWith('ProjectionTopology', { recordsDir: '/mock/concepts' });
  });

  it('reports blocked lookups with structured output', async () => {
    conceptModule.showConceptRecord.mockReturnValueOnce({
      query: 'schema',
      status: 'blocked',
      blocked_by: [{ concept_id: 'concept', anti_alias: 'schema' }],
    });

    const result = await conceptsShowCommand({ query: 'schema' });

    expect(result.exitCode).toBe(1);
    expect(result.result).toMatchObject({
      schema: 'narada.concepts.registry_show.v0',
      status: 'blocked',
      query: 'schema',
      blocked_by: [{ concept_id: 'concept', anti_alias: 'schema' }],
    });
  });

  it('reports validation failure from the registry surface', async () => {
    conceptModule.validateConceptRegistry.mockReturnValueOnce({
      valid: false,
      files_count: 2,
      records_count: 2,
      issues: [{ code: 'concept_registry_duplicate_name', message: 'duplicate name' }],
    });

    const result = await conceptsValidateCommand({});

    expect(result.exitCode).toBe(1);
    expect(result.result).toMatchObject({
      schema: 'narada.concepts.registry_validate.v0',
      status: 'invalid',
      records_dir: '/mock/concepts',
      validation: {
        valid: false,
        files_count: 2,
        records_count: 2,
        issues: [{ code: 'concept_registry_duplicate_name', message: 'duplicate name' }],
      },
    });
    expect(conceptModule.validateConceptRegistry).toHaveBeenCalledWith({ recordsDir: '/mock/concepts' });
  });

  it('lists concept lifecycle records with optional stage filter', async () => {
    const result = await conceptsLifecycleCommand({ stage: 'active' });

    expect(result.exitCode).toBe(0);
    expect(result.result).toMatchObject({
      schema: 'narada.concepts.lifecycle.v0',
      status: 'ok',
      records_dir: '/mock/concepts',
      stage: 'active',
      mode: 'records',
      records_count: 1,
      gaps_count: 0,
      records: [{ concept_id: 'concept_promotion', canonical_name: 'ConceptPromotion', lifecycle_stage: 'active' }],
    });
    expect(conceptModule.listConceptLifecycleRecords).toHaveBeenCalledWith({ recordsDir: '/mock/concepts', stage: 'active' });
    expect(conceptModule.listConceptLifecycleGaps).not.toHaveBeenCalled();
  });

  it('reports lifecycle gaps with attention-required exit posture', async () => {
    const result = await conceptsLifecycleCommand({ gaps: true });

    expect(result.exitCode).toBe(1);
    expect(result.result).toMatchObject({
      schema: 'narada.concepts.lifecycle.v0',
      status: 'attention_required',
      records_dir: '/mock/concepts',
      mode: 'gaps',
      records_count: 0,
      gaps_count: 1,
      gaps: [{ code: 'active_concept_missing_promotion_lifecycle', concept_id: 'concept' }],
    });
    expect(conceptModule.listConceptLifecycleGaps).toHaveBeenCalledWith({ recordsDir: '/mock/concepts' });
    expect(conceptModule.listConceptLifecycleRecords).not.toHaveBeenCalled();
  });
});