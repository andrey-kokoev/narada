import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import {
  conceptRecordSchema,
  type ConceptLifecycleGap,
  type ConceptLifecycleRecordSummary,
  type ConceptPromotionStage,
  type ConceptRecord,
  type ConceptRecordSummary,
  type ConceptRegistryLoadResult,
  type ConceptRegistryQueryResult,
  type ConceptRegistryRecordSource,
  type ConceptRegistryValidation,
  type ConceptValidationIssue,
} from './schema.js';

export const DEFAULT_CONCEPT_RECORDS_DIR = fileURLToPath(new URL('../records', import.meta.url));

interface ConceptRecordIndexEntry {
  record: ConceptRecord;
  file: string;
}

interface ConceptRegistryIndex {
  records: ConceptRecord[];
  sources: ConceptRegistryRecordSource[];
  validation: ConceptRegistryValidation;
  directIndex: Map<string, ConceptRecordIndexEntry[]>;
  antiAliasIndex: Map<string, ConceptRecordIndexEntry[]>;
}

export function loadConceptRegistry(options: { recordsDir?: string } = {}): ConceptRegistryLoadResult {
  const recordsDir = resolve(options.recordsDir ?? DEFAULT_CONCEPT_RECORDS_DIR);
  return readConceptRecords(recordsDir);
}

export function listConceptRecords(options: { recordsDir?: string } = {}): ConceptRecordSummary[] {
  const registry = loadConceptRegistry(options);
  return registry.records
    .slice()
    .sort(compareConceptRecords)
    .map(summarizeConceptRecord);
}

export function listConceptLifecycleRecords(options: { recordsDir?: string; stage?: ConceptPromotionStage } = {}): ConceptLifecycleRecordSummary[] {
  const registry = loadConceptRegistry(options);
  return registry.records
    .slice()
    .sort(compareConceptRecords)
    .filter((record) => options.stage === undefined || record.promotion_lifecycle?.stage === options.stage)
    .map(summarizeConceptLifecycleRecord);
}

export function listConceptLifecycleGaps(options: { recordsDir?: string } = {}): ConceptLifecycleGap[] {
  const registry = loadConceptRegistry(options);
  return registry.records.flatMap((record) => lifecycleGapsForRecord(record));
}

export function showConceptRecord(query: string, options: { recordsDir?: string } = {}): ConceptRegistryQueryResult {
  const index = loadConceptRegistryIndex(options);
  return resolveConceptRecord(index, query);
}

export function validateConceptRegistry(options: { recordsDir?: string } = {}): ConceptRegistryValidation {
  return loadConceptRegistry(options).validation;
}

export function summarizeConceptRecord(record: ConceptRecord): ConceptRecordSummary {
  return {
    concept_id: record.concept_id,
    canonical_name: record.canonical_name,
    kind: record.kind,
    status: record.status,
    owner_surface: record.owner_surface,
    aliases: [...record.aliases],
    deprecated_aliases: [...record.deprecated_aliases],
    confidence: { ...record.confidence },
    reviewed_at: record.reviewed_at,
  };
}

export function summarizeConceptLifecycleRecord(record: ConceptRecord): ConceptLifecycleRecordSummary {
  return {
    ...summarizeConceptRecord(record),
    lifecycle_stage: record.promotion_lifecycle?.stage ?? null,
    ...(record.promotion_lifecycle ? { promotion_lifecycle: record.promotion_lifecycle } : {}),
  };
}

export function loadConceptRegistryIndex(options: { recordsDir?: string } = {}): ConceptRegistryIndex {
  const registry = loadConceptRegistry(options);
  const directIndex = new Map<string, ConceptRecordIndexEntry[]>();
  const antiAliasIndex = new Map<string, ConceptRecordIndexEntry[]>();

  for (const source of registry.sources) {
    const entry: ConceptRecordIndexEntry = { record: source.record, file: source.path };
    registerDirectKey(directIndex, source.record.concept_id, entry);
    registerDirectKey(directIndex, source.record.canonical_name, entry);
    for (const alias of source.record.aliases) registerDirectKey(directIndex, alias, entry);
    for (const alias of source.record.deprecated_aliases) registerDirectKey(directIndex, alias, entry);
    for (const antiAlias of source.record.anti_aliases) registerDirectKey(antiAliasIndex, antiAlias, entry);
  }

  return {
    records: registry.records,
    sources: registry.sources,
    validation: registry.validation,
    directIndex,
    antiAliasIndex,
  };
}

function readConceptRecords(recordsDir: string): ConceptRegistryLoadResult {
  const entries = readdirSync(recordsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.concept.json'))
    .map((entry) => join(recordsDir, entry.name))
    .sort((left, right) => left.localeCompare(right));

  const records: ConceptRecord[] = [];
  const sources: ConceptRegistryRecordSource[] = [];
  const issues: ConceptValidationIssue[] = [];

  for (const file of entries) {
    const raw = readFileSync(file, 'utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch (error) {
      issues.push({
        code: 'concept_record_invalid_json',
        message: error instanceof Error ? error.message : 'Unable to parse ConceptRecord JSON',
        path: file,
      });
      continue;
    }

    const validated = conceptRecordSchema.safeParse(parsed);
    if (!validated.success) {
      for (const problem of validated.error.issues) {
        issues.push({
          code: 'concept_record_schema_invalid',
          message: problem.message,
          field: problem.path.join('.'),
          path: file,
        });
      }
      continue;
    }

    records.push(validated.data);
    sources.push({ path: file, record: validated.data });
  }

  records.sort(compareConceptRecords);
  sources.sort((left, right) => compareConceptRecords(left.record, right.record));

  const validation = validateConceptRegistryRecords(sources, issues);
  return { records, sources, validation };
}

function resolveConceptRecord(index: ConceptRegistryIndex, query: string): ConceptRegistryQueryResult {
  const normalizedQuery = normalizeConceptKey(query);
  const exactMatches = uniqueRecords((index.directIndex.get(normalizedQuery) ?? []).map((entry) => entry.record));

  if (exactMatches.length === 1) {
    return {
      query,
      status: 'found',
      match_kind: matchKindForRecord(exactMatches[0], query),
      record: exactMatches[0],
    };
  }

  if (exactMatches.length > 1) {
    return {
      query,
      status: 'ambiguous',
      matches: exactMatches,
    };
  }

  const blockedMatches = index.antiAliasIndex.get(normalizedQuery) ?? [];
  if (blockedMatches.length > 0) {
    return {
      query,
      status: 'blocked',
      blocked_by: blockedMatches.map((entry) => ({ concept_id: entry.record.concept_id, anti_alias: query })),
    };
  }

  return { query, status: 'not_found' };
}

function validateConceptRegistryRecords(
  sources: ConceptRegistryRecordSource[],
  issues: ConceptValidationIssue[],
): ConceptRegistryValidation {
  const allDirectKeys = new Map<string, ConceptRecordIndexEntry[]>();
  const allAntiAliasKeys = new Map<string, ConceptRecordIndexEntry[]>();

  for (const source of sources) {
    const entry: ConceptRecordIndexEntry = { record: source.record, file: source.path };
    registerDirectKey(allDirectKeys, source.record.concept_id, entry);
    registerDirectKey(allDirectKeys, source.record.canonical_name, entry);
    for (const alias of source.record.aliases) registerDirectKey(allDirectKeys, alias, entry);
    for (const alias of source.record.deprecated_aliases) registerDirectKey(allDirectKeys, alias, entry);
    for (const antiAlias of source.record.anti_aliases) registerDirectKey(allAntiAliasKeys, antiAlias, entry);

    issues.push(...validateSingleRecord(source.record, source.path));
  }

  for (const [key, entries] of allDirectKeys) {
    const conceptIds = uniqueStrings(entries.map((entry) => entry.record.concept_id));
    if (conceptIds.length > 1) {
      issues.push({
        code: 'concept_registry_duplicate_name',
        message: `Direct concept identity key "${key}" is used by multiple records: ${conceptIds.join(', ')}`,
        related_concept_id: conceptIds[0],
        field: 'concept_id|canonical_name|aliases|deprecated_aliases',
      });
    }
  }

  for (const [key, entries] of allAntiAliasKeys) {
    const directEntries = allDirectKeys.get(key) ?? [];
    if (directEntries.length > 0) {
      const antiConceptIds = uniqueStrings(entries.map((entry) => entry.record.concept_id));
      const directConceptIds = uniqueStrings(directEntries.map((entry) => entry.record.concept_id));
      issues.push({
        code: 'concept_registry_anti_alias_conflict',
        message: `Anti-alias "${key}" conflicts with a direct identity key used by ${directConceptIds.join(', ')}`,
        field: 'anti_aliases',
        concept_id: antiConceptIds[0],
        related_concept_id: directConceptIds[0],
      });
    }
  }

  const recordIds = new Set(sources.map((source) => source.record.concept_id));
  for (const source of sources) {
    for (const relation of source.record.relations) {
      if (!recordIds.has(relation.concept_id)) {
        issues.push({
          code: 'concept_registry_missing_relation_reference',
          message: `Relation ${relation.kind} on ${source.record.concept_id} references unknown concept_id ${relation.concept_id}`,
          path: source.path,
          concept_id: source.record.concept_id,
          related_concept_id: relation.concept_id,
          field: 'relations.concept_id',
        });
      }
    }
  }

  return {
    valid: issues.length === 0,
    files_count: sources.length,
    records_count: sources.length,
    issues,
  };
}

function validateSingleRecord(record: ConceptRecord, path: string): ConceptValidationIssue[] {
  const issues: ConceptValidationIssue[] = [];
  const aliases = new Set(record.aliases.map(normalizeConceptKey));
  const deprecatedAliases = new Set(record.deprecated_aliases.map(normalizeConceptKey));
  const antiAliases = new Set(record.anti_aliases.map(normalizeConceptKey));

  if (aliases.has(normalizeConceptKey(record.concept_id)) || aliases.has(normalizeConceptKey(record.canonical_name))) {
    issues.push({
      code: 'concept_record_alias_conflict',
      message: 'Aliases must not repeat the concept_id or canonical_name.',
      path,
      concept_id: record.concept_id,
      field: 'aliases',
    });
  }

  if (deprecatedAliases.has(normalizeConceptKey(record.concept_id)) || deprecatedAliases.has(normalizeConceptKey(record.canonical_name))) {
    issues.push({
      code: 'concept_record_deprecated_alias_conflict',
      message: 'Deprecated aliases must not repeat the concept_id or canonical_name.',
      path,
      concept_id: record.concept_id,
      field: 'deprecated_aliases',
    });
  }

  if (antiAliases.has(normalizeConceptKey(record.concept_id)) || antiAliases.has(normalizeConceptKey(record.canonical_name))) {
    issues.push({
      code: 'concept_record_anti_alias_conflict',
      message: 'Anti-aliases must not repeat the concept_id or canonical_name.',
      path,
      concept_id: record.concept_id,
      field: 'anti_aliases',
    });
  }

  if (uniqueStrings(record.aliases).length !== record.aliases.length) {
    issues.push({
      code: 'concept_record_alias_duplicates',
      message: 'Aliases must be unique within a record.',
      path,
      concept_id: record.concept_id,
      field: 'aliases',
    });
  }

  if (uniqueStrings(record.deprecated_aliases).length !== record.deprecated_aliases.length) {
    issues.push({
      code: 'concept_record_deprecated_alias_duplicates',
      message: 'Deprecated aliases must be unique within a record.',
      path,
      concept_id: record.concept_id,
      field: 'deprecated_aliases',
    });
  }

  if (uniqueStrings(record.anti_aliases).length !== record.anti_aliases.length) {
    issues.push({
      code: 'concept_record_anti_alias_duplicates',
      message: 'Anti-aliases must be unique within a record.',
      path,
      concept_id: record.concept_id,
      field: 'anti_aliases',
    });
  }

  if (record.promotion_lifecycle) {
    const allowedStages = allowedLifecycleStagesForStatus(record.status);
    if (!allowedStages.includes(record.promotion_lifecycle.stage)) {
      issues.push({
        code: 'concept_record_lifecycle_stage_status_mismatch',
        message: `Concept status "${record.status}" is not coherent with promotion_lifecycle.stage "${record.promotion_lifecycle.stage}".`,
        path,
        concept_id: record.concept_id,
        field: 'promotion_lifecycle.stage',
      });
    }

    if (record.promotion_lifecycle.evidence.length === 0) {
      issues.push({
        code: 'concept_record_lifecycle_evidence_missing',
        message: 'promotion_lifecycle.evidence must include at least one evidence reference when promotion_lifecycle is present.',
        path,
        concept_id: record.concept_id,
        field: 'promotion_lifecycle.evidence',
      });
    }
  }

  return issues;
}

function lifecycleGapsForRecord(record: ConceptRecord): ConceptLifecycleGap[] {
  const gaps: ConceptLifecycleGap[] = [];
  const lifecycle = record.promotion_lifecycle;

  if (record.status === 'active' && !lifecycle) {
    gaps.push({
      code: 'active_concept_missing_promotion_lifecycle',
      message: 'Active concepts should carry a source-controlled ConceptPromotion lifecycle record.',
      concept_id: record.concept_id,
      canonical_name: record.canonical_name,
      status: record.status,
      field: 'promotion_lifecycle',
    });
    return gaps;
  }

  if (!lifecycle) return gaps;

  const allowedStages = allowedLifecycleStagesForStatus(record.status);
  if (!allowedStages.includes(lifecycle.stage)) {
    gaps.push({
      code: 'lifecycle_stage_status_mismatch',
      message: `Concept status "${record.status}" is not coherent with promotion_lifecycle.stage "${lifecycle.stage}".`,
      concept_id: record.concept_id,
      canonical_name: record.canonical_name,
      status: record.status,
      lifecycle_stage: lifecycle.stage,
      field: 'promotion_lifecycle.stage',
    });
  }

  if (lifecycle.evidence.length === 0) {
    gaps.push({
      code: 'lifecycle_evidence_missing',
      message: 'ConceptPromotion lifecycle records should cite at least one evidence reference.',
      concept_id: record.concept_id,
      canonical_name: record.canonical_name,
      status: record.status,
      lifecycle_stage: lifecycle.stage,
      field: 'promotion_lifecycle.evidence',
    });
  }

  if (record.status === 'active' && lifecycle.stage === 'active' && !hasValidationEvidence(lifecycle.evidence)) {
    gaps.push({
      code: 'active_concept_missing_validation_evidence',
      message: 'Active concepts should cite validation evidence such as a test, review, or verification reference.',
      concept_id: record.concept_id,
      canonical_name: record.canonical_name,
      status: record.status,
      lifecycle_stage: lifecycle.stage,
      field: 'promotion_lifecycle.evidence',
    });
  }

  return gaps;
}

function allowedLifecycleStagesForStatus(status: ConceptRecord['status']): ConceptPromotionStage[] {
  switch (status) {
    case 'observed':
      return ['observed'];
    case 'draft':
      return ['proposed', 'bounded', 'accepted', 'embodied', 'validated'];
    case 'active':
      return ['active'];
    case 'rejected':
      return ['rejected'];
    case 'deprecated':
      return ['deprecated'];
    case 'superseded':
      return ['superseded'];
  }
}

function hasValidationEvidence(evidence: NonNullable<ConceptRecord['promotion_lifecycle']>['evidence']): boolean {
  return evidence.some((entry) => ['test', 'review', 'verification'].includes(entry.kind));
}

function normalizeConceptKey(value: string): string {
  return value.trim().toLowerCase();
}

function compareConceptRecords(left: ConceptRecord, right: ConceptRecord): number {
  if (left.concept_id < right.concept_id) return -1;
  if (left.concept_id > right.concept_id) return 1;
  if (left.canonical_name < right.canonical_name) return -1;
  if (left.canonical_name > right.canonical_name) return 1;
  return 0;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()))];
}

function uniqueRecords(records: ConceptRecord[]): ConceptRecord[] {
  const seen = new Set<string>();
  const deduped: ConceptRecord[] = [];
  for (const record of records) {
    if (seen.has(record.concept_id)) continue;
    seen.add(record.concept_id);
    deduped.push(record);
  }
  return deduped;
}

function registerDirectKey(map: Map<string, ConceptRecordIndexEntry[]>, key: string, entry: ConceptRecordIndexEntry): void {
  const normalized = normalizeConceptKey(key);
  const existing = map.get(normalized);
  if (existing) {
    existing.push(entry);
    return;
  }
  map.set(normalized, [entry]);
}

function matchKindForRecord(record: ConceptRecord, query: string): 'concept_id' | 'canonical_name' | 'alias' | 'deprecated_alias' {
  if (normalizeConceptKey(record.concept_id) === normalizeConceptKey(query)) return 'concept_id';
  if (normalizeConceptKey(record.canonical_name) === normalizeConceptKey(query)) return 'canonical_name';
  if (record.aliases.some((alias: string) => normalizeConceptKey(alias) === normalizeConceptKey(query))) return 'alias';
  return 'deprecated_alias';
}
