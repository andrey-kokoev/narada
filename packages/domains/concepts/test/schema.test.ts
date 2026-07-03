import { describe, expect, it } from 'vitest';
import { conceptRecordSchema } from '../src/schema.js';

describe('ConceptRecord schema', () => {
  it('accepts a valid ConceptRecord', () => {
    const parsed = conceptRecordSchema.safeParse({
      concept_id: 'surface_attachment',
      canonical_name: 'SurfaceAttachment',
      short_definition: 'The relationship between a surface and a runtime session.',
      description: 'Structured registry embodiment for attachment semantics.',
      kind: 'relation',
      status: 'draft',
      aliases: ['surface attach'],
      deprecated_aliases: [],
      anti_aliases: ['browser tab'],
      boundaries: ['Not the browser tab itself.'],
      relations: [{ kind: 'attaches_to', concept_id: 'concept_registry' }],
      owner_surface: 'Narada proper launcher/NARS architecture',
      authority: { kind: 'package', ref: 'packages/domains/concepts' },
      promotion_lifecycle: {
        stage: 'active',
        evidence: [
          { kind: 'doc', ref: 'docs/concepts/concept-registry.md#conceptpromotion-lifecycle' },
          { kind: 'schema', ref: 'packages/domains/concepts/src/schema.ts' },
        ],
        authority: { kind: 'task_and_doc_governance', ref: 'docs/concepts/concept-registry.md' },
        timestamp: '2026-07-02T00:00:00.000Z',
      },
      schemas: ['packages/domains/concepts/src/schema.ts'],
      docs: ['docs/concepts/concept-registry.md'],
      tasks: ['1724'],
      code_refs: ['packages/domains/concepts/src/registry.ts'],
      tests: ['packages/domains/concepts/test/schema.test.ts'],
      examples: ['surface attachment'],
      counterexamples: ['a browser tab'],
      open_questions: [],
      confidence: { cl: 0.95, basis: 'Architecture doc example.' },
      reviewed_at: '2026-07-02T00:00:00.000Z',
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.promotion_lifecycle?.stage).toBe('active');
      expect(parsed.data.promotion_lifecycle?.evidence).toHaveLength(2);
    }
  });

  it('rejects invalid confidence shape', () => {
    const parsed = conceptRecordSchema.safeParse({
      concept_id: 'surface_attachment',
      canonical_name: 'SurfaceAttachment',
      short_definition: 'The relationship between a surface and a runtime session.',
      description: 'Structured registry embodiment for attachment semantics.',
      kind: 'relation',
      status: 'draft',
      aliases: ['surface attach'],
      deprecated_aliases: [],
      anti_aliases: ['browser tab'],
      boundaries: ['Not the browser tab itself.'],
      relations: [{ kind: 'attaches_to', concept_id: 'concept_registry' }],
      owner_surface: 'Narada proper launcher/NARS architecture',
      authority: { kind: 'package', ref: 'packages/domains/concepts' },
      schemas: ['packages/domains/concepts/src/schema.ts'],
      docs: ['docs/concepts/concept-registry.md'],
      tasks: ['1724'],
      code_refs: ['packages/domains/concepts/src/registry.ts'],
      tests: ['packages/domains/concepts/test/schema.test.ts'],
      examples: ['surface attachment'],
      counterexamples: ['a browser tab'],
      open_questions: [],
      confidence: { cl: 1.5, basis: 'invalid' },
      reviewed_at: '2026-07-02T00:00:00.000Z',
    });

    expect(parsed.success).toBe(false);
  });
});
