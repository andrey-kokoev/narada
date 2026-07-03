declare module '@narada2/concepts' {
  export const DEFAULT_CONCEPT_RECORDS_DIR: string;

  export interface ConceptConfidence {
    cl: number;
    basis: string;
  }

  export interface ConceptRecordSummary {
    concept_id: string;
    canonical_name: string;
    kind: string;
    status: string;
    owner_surface: string;
    aliases: string[];
    deprecated_aliases: string[];
    confidence: ConceptConfidence;
    reviewed_at: string;
  }

  export type ConceptPromotionStage = 'observed' | 'proposed' | 'bounded' | 'accepted' | 'embodied' | 'validated' | 'active' | 'rejected' | 'superseded' | 'deprecated';

  export interface ConceptPromotionEvidence {
    kind: string;
    ref: string;
    note?: string;
  }

  export interface ConceptPromotionLifecycle {
    stage: ConceptPromotionStage;
    evidence: ConceptPromotionEvidence[];
    authority: { kind: string; ref: string; notes?: string };
    timestamp: string;
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
    status: string;
    lifecycle_stage?: ConceptPromotionStage;
    field?: string;
  }

  export interface ConceptRecord {
    concept_id: string;
    canonical_name: string;
    kind: string;
    status: string;
    owner_surface: string;
    aliases: string[];
    deprecated_aliases: string[];
    confidence: ConceptConfidence;
    reviewed_at: string;
  }

  export interface ConceptRegistryValidation {
    valid: boolean;
    files_count: number;
    records_count: number;
    issues: Array<{ code: string; message: string; field?: string; concept_id?: string; path?: string; related_concept_id?: string }>;
  }

  export interface ConceptLookupResolution {
    status: 'found' | 'not_found' | 'ambiguous' | 'blocked';
    match_kind?: 'concept_id' | 'canonical_name' | 'alias' | 'deprecated_alias';
    record?: ConceptRecord;
    matches?: ConceptRecord[];
    blocked_by?: Array<{ concept_id: string; anti_alias: string }>;
  }

  export function listConceptRecords(options?: { recordsDir?: string }): ConceptRecordSummary[];
  export function listConceptLifecycleRecords(options?: { recordsDir?: string; stage?: ConceptPromotionStage }): ConceptLifecycleRecordSummary[];
  export function listConceptLifecycleGaps(options?: { recordsDir?: string }): ConceptLifecycleGap[];
  export function showConceptRecord(query: string, options?: { recordsDir?: string }): ConceptLookupResolution;
  export function validateConceptRegistry(options?: { recordsDir?: string }): ConceptRegistryValidation;
}