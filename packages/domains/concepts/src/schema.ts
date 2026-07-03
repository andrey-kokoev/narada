type ValidationIssue = { message: string; path: Array<string | number> };

type SafeParseSuccess<T> = { success: true; data: T };
type SafeParseFailure = { success: false; error: { issues: ValidationIssue[] } };
type SafeParseResult<T> = SafeParseSuccess<T> | SafeParseFailure;

interface Schema<T> {
  parse(value: unknown): T;
  safeParse(value: unknown): SafeParseResult<T>;
}

function makeSchema<T>(validator: (value: unknown) => SafeParseResult<T>): Schema<T> {
  return {
    parse(value: unknown): T {
      const result = validator(value);
      if (!result.success) {
        const message = result.error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`).join('; ');
        throw new Error(message);
      }
      return result.data;
    },
    safeParse(value: unknown): SafeParseResult<T> {
      return validator(value);
    },
  };
}

function success<T>(data: T): SafeParseSuccess<T> {
  return { success: true, data };
}

function failure(...issues: ValidationIssue[]): SafeParseFailure {
  return { success: false, error: { issues } };
}

function requireSuccess<T>(result: SafeParseResult<T>): T {
  if (!result.success) {
    throw new Error('Unexpected validation failure');
  }
  return result.data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateString(value: unknown, path: Array<string | number>, label: string, options: { minLength?: number; regex?: RegExp } = {}): SafeParseResult<string> {
  if (typeof value !== 'string') {
    return failure({ message: `${label} must be a string`, path });
  }

  const trimmed = value.trim();
  if ((options.minLength ?? 1) > 0 && trimmed.length < (options.minLength ?? 1)) {
    return failure({ message: `${label} must not be empty`, path });
  }

  if (options.regex && !options.regex.test(trimmed)) {
    return failure({ message: `${label} is invalid`, path });
  }

  return success(trimmed);
}

function validateStringArray(value: unknown, path: Array<string | number>, label: string): SafeParseResult<string[]> {
  if (!Array.isArray(value)) {
    return failure({ message: `${label} must be an array`, path });
  }

  const items: string[] = [];
  const issues: ValidationIssue[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const result = validateString(value[index], [...path, index], `${label}[${index}]`, { minLength: 1 });
    if (result.success) {
      items.push(result.data);
    } else {
      issues.push(...result.error.issues);
    }
  }

  return issues.length > 0 ? failure(...issues) : success(items);
}

function validateRelation(value: unknown, path: Array<string | number>): SafeParseResult<ConceptRelation> {
  if (!isRecord(value)) {
    return failure({ message: 'Relation must be an object', path });
  }

  const kind = validateString(value.kind, [...path, 'kind'], 'kind');
  const conceptId = validateConceptId(value.concept_id, [...path, 'concept_id']);
  const note = value.note === undefined ? success<string | undefined>(undefined) : validateString(value.note, [...path, 'note'], 'note');

  if (!kind.success) return failure(...kind.error.issues);
  if (!conceptId.success) return failure(...conceptId.error.issues);
  if (!note.success) return failure(...note.error.issues);

  const relation: ConceptRelation = { kind: kind.data, concept_id: conceptId.data };
  if (note.data !== undefined) relation.note = note.data;
  return success(relation);
}

function validateAuthority(value: unknown, path: Array<string | number>): SafeParseResult<ConceptAuthority> {
  if (!isRecord(value)) {
    return failure({ message: 'Authority must be an object', path });
  }

  const kind = validateString(value.kind, [...path, 'kind'], 'kind');
  const ref = validateString(value.ref, [...path, 'ref'], 'ref');
  const notes = value.notes === undefined ? success<string | undefined>(undefined) : validateString(value.notes, [...path, 'notes'], 'notes');

  if (!kind.success) return failure(...kind.error.issues);
  if (!ref.success) return failure(...ref.error.issues);
  if (!notes.success) return failure(...notes.error.issues);

  const authority: ConceptAuthority = { kind: kind.data, ref: ref.data };
  if (notes.data !== undefined) authority.notes = notes.data;
  return success(authority);
}

function validatePromotionEvidence(value: unknown, path: Array<string | number>): SafeParseResult<ConceptPromotionEvidence> {
  if (!isRecord(value)) {
    return failure({ message: 'promotion evidence must be an object', path });
  }

  const kind = validateString(value.kind, [...path, 'kind'], 'kind');
  const ref = validateString(value.ref, [...path, 'ref'], 'ref');
  const note = value.note === undefined ? success<string | undefined>(undefined) : validateString(value.note, [...path, 'note'], 'note');

  if (!kind.success) return failure(...kind.error.issues);
  if (!ref.success) return failure(...ref.error.issues);
  if (!note.success) return failure(...note.error.issues);

  const evidence: ConceptPromotionEvidence = { kind: kind.data, ref: ref.data };
  if (note.data !== undefined) evidence.note = note.data;
  return success(evidence);
}

function validatePromotionLifecycle(value: unknown, path: Array<string | number>): SafeParseResult<ConceptPromotionLifecycle | undefined> {
  if (value === undefined) {
    return success<ConceptPromotionLifecycle | undefined>(undefined);
  }
  if (!isRecord(value)) {
    return failure({ message: 'promotion_lifecycle must be an object', path });
  }

  const stage = validateEnum(value.stage, [...path, 'stage'], 'stage', ['observed', 'proposed', 'bounded', 'accepted', 'embodied', 'validated', 'active', 'rejected', 'superseded', 'deprecated'] as const);
  const evidence = validatePromotionEvidences(value.evidence, [...path, 'evidence']);
  const authority = validateAuthority(value.authority, [...path, 'authority']);
  const timestamp = validateReviewedAt(value.timestamp, [...path, 'timestamp']);

  const results = [stage, evidence, authority, timestamp];
  const issues: ValidationIssue[] = [];
  for (const result of results) {
    if (!result.success) issues.push(...result.error.issues);
  }
  if (issues.length > 0) return failure(...issues);

  return success({
    stage: requireSuccess(stage),
    evidence: requireSuccess(evidence),
    authority: requireSuccess(authority),
    timestamp: requireSuccess(timestamp),
  });
}

function validatePromotionEvidences(value: unknown, path: Array<string | number>): SafeParseResult<ConceptPromotionEvidence[]> {
  if (!Array.isArray(value)) {
    return failure({ message: 'evidence must be an array', path });
  }

  const items: ConceptPromotionEvidence[] = [];
  const issues: ValidationIssue[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const evidence = validatePromotionEvidence(value[index], [...path, index]);
    if (evidence.success) {
      items.push(evidence.data);
    } else {
      issues.push(...evidence.error.issues);
    }
  }

  return issues.length > 0 ? failure(...issues) : success(items);
}

function validateConfidence(value: unknown, path: Array<string | number>): SafeParseResult<ConceptConfidence> {
  if (!isRecord(value)) {
    return failure({ message: 'confidence must be an object', path });
  }

  const cl = value.cl;
  const basis = validateString(value.basis, [...path, 'basis'], 'basis');
  const issues: ValidationIssue[] = [];
  if (typeof cl !== 'number' || Number.isNaN(cl) || cl < 0 || cl > 1) {
    issues.push({ message: 'cl must be a number between 0 and 1', path: [...path, 'cl'] });
  }
  if (!basis.success) issues.push(...basis.error.issues);
  if (issues.length > 0) return failure(...issues);
  return success({ cl: cl as number, basis: requireSuccess(basis) });
}

function validateReviewedAt(value: unknown, path: Array<string | number>): SafeParseResult<string> {
  const result = validateString(value, path, 'reviewed_at');
  if (!result.success) return result;
  const parsed = new Date(result.data);
  if (Number.isNaN(parsed.getTime())) {
    return failure({ message: 'reviewed_at must be an ISO datetime', path });
  }
  return success(result.data);
}

function validateConceptId(value: unknown, path: Array<string | number>): SafeParseResult<string> {
  return validateString(value, path, 'concept_id', { regex: /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/ });
}

function validateCanonicalName(value: unknown, path: Array<string | number>): SafeParseResult<string> {
  return validateString(value, path, 'canonical_name', { regex: /^[A-Z][A-Za-z0-9]*$/ });
}

function validateConceptRecord(value: unknown): SafeParseResult<ConceptRecord> {
  if (!isRecord(value)) {
    return failure({ message: 'ConceptRecord must be an object', path: [] });
  }

  const conceptId = validateConceptId(value.concept_id, ['concept_id']);
  const canonicalName = validateCanonicalName(value.canonical_name, ['canonical_name']);
  const shortDefinition = validateString(value.short_definition, ['short_definition'], 'short_definition');
  const description = validateString(value.description, ['description'], 'description');
  const kind = validateConceptKind(value.kind, ['kind']);
  const status = validateConceptStatus(value.status, ['status']);
  const aliases = validateStringArray(value.aliases, ['aliases'], 'aliases');
  const deprecatedAliases = validateStringArray(value.deprecated_aliases, ['deprecated_aliases'], 'deprecated_aliases');
  const antiAliases = validateStringArray(value.anti_aliases, ['anti_aliases'], 'anti_aliases');
  const boundaries = validateStringArray(value.boundaries, ['boundaries'], 'boundaries');
  const relations = validateRelations(value.relations, ['relations']);
  const ownerSurface = validateString(value.owner_surface, ['owner_surface'], 'owner_surface');
  const authority = validateAuthority(value.authority, ['authority']);
  const promotionLifecycle = validatePromotionLifecycle(value.promotion_lifecycle, ['promotion_lifecycle']);
  const schemas = validateStringArray(value.schemas, ['schemas'], 'schemas');
  const docs = validateStringArray(value.docs, ['docs'], 'docs');
  const tasks = validateStringArray(value.tasks, ['tasks'], 'tasks');
  const codeRefs = validateStringArray(value.code_refs, ['code_refs'], 'code_refs');
  const tests = validateStringArray(value.tests, ['tests'], 'tests');
  const examples = validateStringArray(value.examples, ['examples'], 'examples');
  const counterexamples = validateStringArray(value.counterexamples, ['counterexamples'], 'counterexamples');
  const openQuestions = validateStringArray(value.open_questions, ['open_questions'], 'open_questions');
  const confidence = validateConfidence(value.confidence, ['confidence']);
  const reviewedAt = validateReviewedAt(value.reviewed_at, ['reviewed_at']);

  const results = [
    conceptId,
    canonicalName,
    shortDefinition,
    description,
    kind,
    status,
    aliases,
    deprecatedAliases,
    antiAliases,
    boundaries,
    relations,
    ownerSurface,
    authority,
    promotionLifecycle,
    schemas,
    docs,
    tasks,
    codeRefs,
    tests,
    examples,
    counterexamples,
    openQuestions,
    confidence,
    reviewedAt,
  ];

  const issues: ValidationIssue[] = [];
  for (const result of results) {
    if (!result.success) issues.push(...result.error.issues);
  }
  if (issues.length > 0) return failure(...issues);

  const conceptIdValue = requireSuccess(conceptId);
  const canonicalNameValue = requireSuccess(canonicalName);
  const shortDefinitionValue = requireSuccess(shortDefinition);
  const descriptionValue = requireSuccess(description);
  const kindValue = requireSuccess(kind);
  const statusValue = requireSuccess(status);
  const aliasesValue = requireSuccess(aliases);
  const deprecatedAliasesValue = requireSuccess(deprecatedAliases);
  const antiAliasesValue = requireSuccess(antiAliases);
  const boundariesValue = requireSuccess(boundaries);
  const relationsValue = requireSuccess(relations);
  const ownerSurfaceValue = requireSuccess(ownerSurface);
  const authorityValue = requireSuccess(authority);
  const promotionLifecycleValue = requireSuccess(promotionLifecycle);
  const schemasValue = requireSuccess(schemas);
  const docsValue = requireSuccess(docs);
  const tasksValue = requireSuccess(tasks);
  const codeRefsValue = requireSuccess(codeRefs);
  const testsValue = requireSuccess(tests);
  const examplesValue = requireSuccess(examples);
  const counterexamplesValue = requireSuccess(counterexamples);
  const openQuestionsValue = requireSuccess(openQuestions);
  const confidenceValue = requireSuccess(confidence);
  const reviewedAtValue = requireSuccess(reviewedAt);

  return success({
    concept_id: conceptIdValue,
    canonical_name: canonicalNameValue,
    short_definition: shortDefinitionValue,
    description: descriptionValue,
    kind: kindValue,
    status: statusValue,
    aliases: aliasesValue,
    deprecated_aliases: deprecatedAliasesValue,
    anti_aliases: antiAliasesValue,
    boundaries: boundariesValue,
    relations: relationsValue,
    owner_surface: ownerSurfaceValue,
    authority: authorityValue,
    promotion_lifecycle: promotionLifecycleValue,
    schemas: schemasValue,
    docs: docsValue,
    tasks: tasksValue,
    code_refs: codeRefsValue,
    tests: testsValue,
    examples: examplesValue,
    counterexamples: counterexamplesValue,
    open_questions: openQuestionsValue,
    confidence: confidenceValue,
    reviewed_at: reviewedAtValue,
  });
}

function validateConceptStatus(value: unknown, path: Array<string | number>): SafeParseResult<ConceptStatus> {
  return validateEnum(value, path, 'status', ['observed', 'draft', 'active', 'deprecated', 'rejected', 'superseded'] as const);
}

function validateConceptKind(value: unknown, path: Array<string | number>): SafeParseResult<ConceptKind> {
  return validateEnum(value, path, 'kind', ['entity', 'relation', 'policy', 'protocol', 'lifecycle', 'surface', 'host', 'artifact', 'event', 'capability', 'instance', 'other'] as const);
}

function validateEnum<const T extends readonly string[]>(value: unknown, path: Array<string | number>, label: string, allowed: T): SafeParseResult<T[number]> {
  const result = validateString(value, path, label);
  if (!result.success) return result as SafeParseResult<T[number]>;
  if (!allowed.includes(result.data as T[number])) {
    return failure({ message: `${label} must be one of ${allowed.join(', ')}`, path });
  }
  return success(result.data as T[number]);
}

function validateRelations(value: unknown, path: Array<string | number>): SafeParseResult<ConceptRelation[]> {
  if (!Array.isArray(value)) {
    return failure({ message: 'relations must be an array', path });
  }

  const items: ConceptRelation[] = [];
  const issues: ValidationIssue[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const relation = validateRelation(value[index], [...path, index]);
    if (relation.success) {
      items.push(relation.data);
    } else {
      issues.push(...relation.error.issues);
    }
  }
  return issues.length > 0 ? failure(...issues) : success(items);
}

export const conceptStatusSchema = makeSchema<ConceptStatus>((value) => validateConceptStatus(value, []));
export const conceptKindSchema = makeSchema<ConceptKind>((value) => validateConceptKind(value, []));
export const conceptIdSchema = makeSchema<string>((value) => validateConceptId(value, []));
export const conceptCanonicalNameSchema = makeSchema<string>((value) => validateCanonicalName(value, []));
export const conceptRelationSchema = makeSchema<ConceptRelation>((value) => validateRelation(value, []));
export const conceptAuthoritySchema = makeSchema<ConceptAuthority>((value) => validateAuthority(value, []));
export const conceptConfidenceSchema = makeSchema<ConceptConfidence>((value) => validateConfidence(value, []));
export const conceptRecordSchema = makeSchema<ConceptRecord>(validateConceptRecord);

export type ConceptStatus = 'observed' | 'draft' | 'active' | 'deprecated' | 'rejected' | 'superseded';
export type ConceptKind = 'entity' | 'relation' | 'policy' | 'protocol' | 'lifecycle' | 'surface' | 'host' | 'artifact' | 'event' | 'capability' | 'instance' | 'other';

export interface ConceptRelation {
  kind: string;
  concept_id: string;
  note?: string;
}

export interface ConceptAuthority {
  kind: string;
  ref: string;
  notes?: string;
}

export interface ConceptPromotionEvidence {
  kind: string;
  ref: string;
  note?: string;
}

export type ConceptPromotionStage = 'observed' | 'proposed' | 'bounded' | 'accepted' | 'embodied' | 'validated' | 'active' | 'rejected' | 'superseded' | 'deprecated';

export interface ConceptPromotionLifecycle {
  stage: ConceptPromotionStage;
  evidence: ConceptPromotionEvidence[];
  authority: ConceptAuthority;
  timestamp: string;
}

export interface ConceptConfidence {
  cl: number;
  basis: string;
}

export interface ConceptRecord {
  concept_id: string;
  canonical_name: string;
  short_definition: string;
  description: string;
  kind: ConceptKind;
  status: ConceptStatus;
  aliases: string[];
  deprecated_aliases: string[];
  anti_aliases: string[];
  boundaries: string[];
  relations: ConceptRelation[];
  owner_surface: string;
  authority: ConceptAuthority;
  promotion_lifecycle?: ConceptPromotionLifecycle;
  schemas: string[];
  docs: string[];
  tasks: string[];
  code_refs: string[];
  tests: string[];
  examples: string[];
  counterexamples: string[];
  open_questions: string[];
  confidence: ConceptConfidence;
  reviewed_at: string;
}

export interface ConceptLifecycleRecordSummary extends ConceptRecordSummary {
  lifecycle_stage: ConceptPromotionStage | null;
  promotion_lifecycle?: ConceptPromotionLifecycle;
}

export interface ConceptLifecycleGap {
  code: string;
  message: string;
  concept_id: string;
  canonical_name: string;
  status: ConceptStatus;
  lifecycle_stage?: ConceptPromotionStage;
  field?: string;
}

export interface ConceptValidationIssue {
  code: string;
  message: string;
  field?: string;
  concept_id?: string;
  path?: string;
  related_concept_id?: string;
}

export interface ConceptLookupResolution {
  status: 'found' | 'not_found' | 'ambiguous' | 'blocked';
  match_kind?: 'concept_id' | 'canonical_name' | 'alias' | 'deprecated_alias';
  record?: ConceptRecord;
  matches?: ConceptRecord[];
  blocked_by?: Array<{ concept_id: string; anti_alias: string }>;
}

export interface ConceptRegistryValidation {
  valid: boolean;
  files_count: number;
  records_count: number;
  issues: ConceptValidationIssue[];
}

export interface ConceptRegistryRecordSource {
  path: string;
  record: ConceptRecord;
}

export interface ConceptRegistryLoadResult {
  records: ConceptRecord[];
  sources: ConceptRegistryRecordSource[];
  validation: ConceptRegistryValidation;
}

export interface ConceptRecordSummary {
  concept_id: string;
  canonical_name: string;
  kind: ConceptKind;
  status: ConceptStatus;
  owner_surface: string;
  aliases: string[];
  deprecated_aliases: string[];
  confidence: ConceptConfidence;
  reviewed_at: string;
}

export interface ConceptRegistryQueryResult extends ConceptLookupResolution {
  query: string;
}
