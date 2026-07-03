import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONCEPT_RECORDS_DIR,
  listConceptLifecycleGaps,
  listConceptLifecycleRecords,
  listConceptRecords,
  loadConceptRegistry,
  loadConceptRegistryIndex,
  showConceptRecord,
  validateConceptRegistry,
} from '../src/registry.js';

function makeConceptRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    concept_id: 'alpha',
    canonical_name: 'Alpha',
    short_definition: 'Alpha',
    description: 'Alpha',
    kind: 'entity',
    status: 'draft',
    aliases: [],
    deprecated_aliases: [],
    anti_aliases: [],
    boundaries: [],
    relations: [],
    owner_surface: 'test',
    authority: { kind: 'package', ref: 'test' },
    schemas: [],
    docs: [],
    tasks: [],
    code_refs: [],
    tests: [],
    examples: [],
    counterexamples: [],
    open_questions: [],
    confidence: { cl: 0.8, basis: 'seed' },
    reviewed_at: '2026-07-02T00:00:00.000Z',
    ...overrides,
  };
}

describe('ConceptRegistry loader', () => {
  it('loads the seeded registry records', () => {
    const registry = loadConceptRegistry({ recordsDir: DEFAULT_CONCEPT_RECORDS_DIR });
    expect(registry.validation.valid).toBe(true);
    expect(registry.records.map((record) => record.concept_id)).toEqual(
      expect.arrayContaining([
        'concept',
        'concept_promotion',
        'concept_record',
        'concept_registry',
        'surface_attachment',
        'compatibility_migration_contract',
        'host_profile',
        'operator_error_taxonomy',
        'runtime_capability_profile',
        'work_order',
        'nars_session_management',
        'nars_runtime_contract',
        'nars_client_projection_contract',
        'runtime_health_posture',
        'authority_runtime_host_transition',
        'projection_topology',
        'loop_definition',
        'watch_definition',
      ]),
    );
    expect(registry.records.length).toBeGreaterThanOrEqual(21);
  });

  it('supports lookup by id, canonical name, alias, and deprecated alias', () => {
    const index = loadConceptRegistryIndex({ recordsDir: DEFAULT_CONCEPT_RECORDS_DIR });

    expect(showConceptRecord('concept', { recordsDir: DEFAULT_CONCEPT_RECORDS_DIR }).status).toBe('found');
    expect(showConceptRecord('ConceptRegistry', { recordsDir: DEFAULT_CONCEPT_RECORDS_DIR }).status).toBe('found');
    expect(showConceptRecord('registry', { recordsDir: DEFAULT_CONCEPT_RECORDS_DIR }).status).toBe('found');
    expect(showConceptRecord('registry record', { recordsDir: DEFAULT_CONCEPT_RECORDS_DIR }).status).toBe('found');
    expect(showConceptRecord('delegation work order', { recordsDir: DEFAULT_CONCEPT_RECORDS_DIR }).status).toBe('found');
    expect(showConceptRecord('session index', { recordsDir: DEFAULT_CONCEPT_RECORDS_DIR }).status).toBe('found');
    expect(showConceptRecord('runtime posture', { recordsDir: DEFAULT_CONCEPT_RECORDS_DIR }).status).toBe('found');
    expect(showConceptRecord('compatibility migration', { recordsDir: DEFAULT_CONCEPT_RECORDS_DIR }).status).toBe('found');
    expect(showConceptRecord('operator error taxonomy', { recordsDir: DEFAULT_CONCEPT_RECORDS_DIR }).status).toBe('found');
    expect(showConceptRecord('runtime capability profile', { recordsDir: DEFAULT_CONCEPT_RECORDS_DIR }).status).toBe('found');
    expect(showConceptRecord('host profile', { recordsDir: DEFAULT_CONCEPT_RECORDS_DIR }).status).toBe('found');
    expect(showConceptRecord('ProjectionTopology', { recordsDir: DEFAULT_CONCEPT_RECORDS_DIR }).status).toBe('found');
    expect(showConceptRecord('projection_topology', { recordsDir: DEFAULT_CONCEPT_RECORDS_DIR }).status).toBe('found');
    expect(showConceptRecord('NaradaRuntimeProjectionGraph', { recordsDir: DEFAULT_CONCEPT_RECORDS_DIR }).status).toBe('found');
    expect(showConceptRecord('LoopDefinition', { recordsDir: DEFAULT_CONCEPT_RECORDS_DIR }).status).toBe('found');
    expect(showConceptRecord('WatchDefinition', { recordsDir: DEFAULT_CONCEPT_RECORDS_DIR }).status).toBe('found');
    expect(showConceptRecord('loop policy', { recordsDir: DEFAULT_CONCEPT_RECORDS_DIR }).status).toBe('found');
    expect(showConceptRecord('watch policy', { recordsDir: DEFAULT_CONCEPT_RECORDS_DIR }).status).toBe('found');
    expect(index.validation.valid).toBe(true);
  });

  it('blocks anti-alias queries', () => {
    const result = showConceptRecord('schema', { recordsDir: DEFAULT_CONCEPT_RECORDS_DIR });
    expect(result.status).toBe('blocked');
    expect(result.blocked_by?.some((entry) => entry.concept_id === 'concept')).toBe(true);
  });

  it('returns structured validation errors for duplicate names and aliases', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'narada-concept-registry-'));
    try {
      mkdirSync(tempDir, { recursive: true });
      writeFileSync(
        join(tempDir, 'a.concept.json'),
        JSON.stringify({
          concept_id: 'alpha',
          canonical_name: 'Alpha',
          short_definition: 'Alpha',
          description: 'Alpha',
          kind: 'entity',
          status: 'draft',
          aliases: ['shared'],
          deprecated_aliases: [],
          anti_aliases: [],
          boundaries: [],
          relations: [],
          owner_surface: 'test',
          authority: { kind: 'package', ref: 'test' },
          schemas: [],
          docs: [],
          tasks: [],
          code_refs: [],
          tests: [],
          examples: [],
          counterexamples: [],
          open_questions: [],
          confidence: { cl: 0.8, basis: 'seed' },
          reviewed_at: '2026-07-02T00:00:00.000Z',
        }),
      );
      writeFileSync(
        join(tempDir, 'b.concept.json'),
        JSON.stringify({
          concept_id: 'beta',
          canonical_name: 'Beta',
          short_definition: 'Beta',
          description: 'Beta',
          kind: 'entity',
          status: 'draft',
          aliases: ['shared'],
          deprecated_aliases: [],
          anti_aliases: ['Alpha'],
          boundaries: [],
          relations: [],
          owner_surface: 'test',
          authority: { kind: 'package', ref: 'test' },
          schemas: [],
          docs: [],
          tasks: [],
          code_refs: [],
          tests: [],
          examples: [],
          counterexamples: [],
          open_questions: [],
          confidence: { cl: 0.8, basis: 'seed' },
          reviewed_at: '2026-07-02T00:00:00.000Z',
        }),
      );

      const result = validateConceptRegistry({ recordsDir: tempDir });
      expect(result.valid).toBe(false);
      expect(result.issues.some((issue) => issue.code === 'concept_registry_duplicate_name')).toBe(true);
      expect(result.issues.some((issue) => issue.code === 'concept_registry_anti_alias_conflict')).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('reports missing relation references', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'narada-concept-registry-rel-'));
    try {
      writeFileSync(
        join(tempDir, 'a.concept.json'),
        JSON.stringify({
          concept_id: 'alpha',
          canonical_name: 'Alpha',
          short_definition: 'Alpha',
          description: 'Alpha',
          kind: 'entity',
          status: 'draft',
          aliases: [],
          deprecated_aliases: [],
          anti_aliases: [],
          boundaries: [],
          relations: [{ kind: 'relates_to', concept_id: 'missing_concept' }],
          owner_surface: 'test',
          authority: { kind: 'package', ref: 'test' },
          schemas: [],
          docs: [],
          tasks: [],
          code_refs: [],
          tests: [],
          examples: [],
          counterexamples: [],
          open_questions: [],
          confidence: { cl: 0.8, basis: 'seed' },
          reviewed_at: '2026-07-02T00:00:00.000Z',
        }),
      );

      const result = validateConceptRegistry({ recordsDir: tempDir });
      expect(result.valid).toBe(false);
      expect(result.issues.some((issue) => issue.code === 'concept_registry_missing_relation_reference')).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('lists summaries from the registry', () => {
    const summaries = listConceptRecords({ recordsDir: DEFAULT_CONCEPT_RECORDS_DIR });
    expect(summaries.some((summary) => summary.concept_id === 'concept')).toBe(true);
    expect(summaries.some((summary) => summary.concept_id === 'compatibility_migration_contract')).toBe(true);
    expect(summaries.some((summary) => summary.concept_id === 'host_profile')).toBe(true);
    expect(summaries.some((summary) => summary.concept_id === 'operator_error_taxonomy')).toBe(true);
    expect(summaries.some((summary) => summary.concept_id === 'projection_topology')).toBe(true);
    expect(summaries.some((summary) => summary.concept_id === 'runtime_capability_profile')).toBe(true);
    expect(summaries.some((summary) => summary.concept_id === 'surface_attachment')).toBe(true);
    expect(summaries.some((summary) => summary.concept_id === 'watch_definition')).toBe(true);
    expect(summaries.some((summary) => summary.concept_id === 'loop_definition')).toBe(true);
    expect(summaries.some((summary) => summary.concept_id === 'work_order')).toBe(true);
  });

  it('lists lifecycle records and filters by stage', () => {
    const all = listConceptLifecycleRecords({ recordsDir: DEFAULT_CONCEPT_RECORDS_DIR });
    const active = listConceptLifecycleRecords({ recordsDir: DEFAULT_CONCEPT_RECORDS_DIR, stage: 'active' });

    expect(all.some((summary) => summary.concept_id === 'concept_promotion')).toBe(true);
    expect(active.some((summary) => summary.concept_id === 'concept_promotion')).toBe(true);
    expect(active.every((summary) => summary.lifecycle_stage === 'active')).toBe(true);
  });

  it('reports lifecycle gaps for active concepts that predate lifecycle metadata', () => {
    const gaps = listConceptLifecycleGaps({ recordsDir: DEFAULT_CONCEPT_RECORDS_DIR });

    expect(gaps.some((gap) => gap.code === 'active_concept_missing_promotion_lifecycle')).toBe(true);
    expect(gaps.some((gap) => gap.concept_id === 'concept_promotion')).toBe(false);
  });

  it('validates lifecycle stage/status coherence and lifecycle evidence', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'narada-concept-registry-lifecycle-'));
    try {
      writeFileSync(
        join(tempDir, 'mismatch.concept.json'),
        JSON.stringify(makeConceptRecord({
          concept_id: 'mismatch',
          canonical_name: 'Mismatch',
          status: 'active',
          promotion_lifecycle: {
            stage: 'proposed',
            evidence: [{ kind: 'test', ref: 'test/ref' }],
            authority: { kind: 'package', ref: 'test' },
            timestamp: '2026-07-02T00:00:00.000Z',
          },
        })),
      );
      writeFileSync(
        join(tempDir, 'empty-evidence.concept.json'),
        JSON.stringify(makeConceptRecord({
          concept_id: 'empty_evidence',
          canonical_name: 'EmptyEvidence',
          status: 'draft',
          promotion_lifecycle: {
            stage: 'proposed',
            evidence: [],
            authority: { kind: 'package', ref: 'test' },
            timestamp: '2026-07-02T00:00:00.000Z',
          },
        })),
      );

      const result = validateConceptRegistry({ recordsDir: tempDir });
      expect(result.valid).toBe(false);
      expect(result.issues.some((issue) => issue.code === 'concept_record_lifecycle_stage_status_mismatch')).toBe(true);
      expect(result.issues.some((issue) => issue.code === 'concept_record_lifecycle_evidence_missing')).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});