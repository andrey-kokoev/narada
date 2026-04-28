import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export type SiteRelationKind =
  | 'absorbed'
  | 'absorbed_by'
  | 'references'
  | 'routes_to'
  | 'subscribes_to'
  | 'publishes_to';

export type SiteRelationStatus = 'active' | 'superseded' | 'rejected';

export interface SiteRelationRecord {
  relation_id: string;
  relation_kind: SiteRelationKind;
  source_site_ref: string;
  target_site_ref: string;
  authority_effect: string;
  admitted_material: string[];
  evidence_refs: string[];
  lineage_event_refs: string[];
  reciprocal_required: boolean;
  reciprocal_relation_id: string | null;
  status: SiteRelationStatus;
  created_by: string;
  created_at: string;
  superseded_by: string | null;
  superseded_at: string | null;
  rejection_reason: string | null;
}

export interface SiteRelationRegistry {
  registry_kind: 'site_relation_registry';
  registry_version: 1;
  relations: SiteRelationRecord[];
}

export interface SiteRelationValidationIssue {
  relation_id: string;
  severity: 'error' | 'warning';
  code: string;
  message: string;
}

const RELATION_KINDS: SiteRelationKind[] = [
  'absorbed',
  'absorbed_by',
  'references',
  'routes_to',
  'subscribes_to',
  'publishes_to',
];

const DEFAULT_RECIPROCAL_KIND: Record<SiteRelationKind, SiteRelationKind | null> = {
  absorbed: 'absorbed_by',
  absorbed_by: 'absorbed',
  references: null,
  routes_to: null,
  subscribes_to: 'publishes_to',
  publishes_to: 'subscribes_to',
};

export function siteRelationRegistryPath(cwd: string): string {
  return join(resolve(cwd), '.ai', 'site-relation-registry.json');
}

export function parseSiteRelationKind(value: string): SiteRelationKind {
  if ((RELATION_KINDS as string[]).includes(value)) return value as SiteRelationKind;
  throw new Error(`Unsupported relation kind: ${value}. Use one of: ${RELATION_KINDS.join(', ')}`);
}

export function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(',').map((part) => part.trim()).filter(Boolean);
}

function emptyRegistry(): SiteRelationRegistry {
  return {
    registry_kind: 'site_relation_registry',
    registry_version: 1,
    relations: [],
  };
}

export async function readSiteRelationRegistry(cwd: string): Promise<SiteRelationRegistry> {
  const path = siteRelationRegistryPath(cwd);
  if (!existsSync(path)) return emptyRegistry();
  const parsed = JSON.parse(await readFile(path, 'utf8')) as Partial<SiteRelationRegistry>;
  return {
    registry_kind: 'site_relation_registry',
    registry_version: 1,
    relations: Array.isArray(parsed.relations) ? parsed.relations : [],
  };
}

export async function writeSiteRelationRegistry(cwd: string, registry: SiteRelationRegistry): Promise<string> {
  const path = siteRelationRegistryPath(cwd);
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
  await rename(tempPath, path);
  return path;
}

export function makeSiteRelationRecord(args: {
  relationKind: string;
  sourceSite: string;
  targetSite: string;
  authorityEffect?: string;
  admittedMaterial?: string[];
  evidenceRefs?: string[];
  lineageEventRefs?: string[];
  reciprocalRequired?: boolean;
  reciprocalRelationId?: string | null;
  createdBy: string;
  now?: Date;
}): SiteRelationRecord {
  const relationKind = parseSiteRelationKind(args.relationKind);
  return {
    relation_id: `site_rel_${randomUUID()}`,
    relation_kind: relationKind,
    source_site_ref: requireText(args.sourceSite, '--source-site'),
    target_site_ref: requireText(args.targetSite, '--target-site'),
    authority_effect: args.authorityEffect?.trim() || defaultAuthorityEffect(relationKind),
    admitted_material: args.admittedMaterial ?? [],
    evidence_refs: args.evidenceRefs ?? [],
    lineage_event_refs: args.lineageEventRefs ?? [],
    reciprocal_required: args.reciprocalRequired ?? false,
    reciprocal_relation_id: args.reciprocalRelationId ?? null,
    status: 'active',
    created_by: requireText(args.createdBy, '--by'),
    created_at: (args.now ?? new Date()).toISOString(),
    superseded_by: null,
    superseded_at: null,
    rejection_reason: null,
  };
}

export function validateSiteRelations(registry: SiteRelationRegistry): SiteRelationValidationIssue[] {
  const issues: SiteRelationValidationIssue[] = [];
  const active = registry.relations.filter((relation) => relation.status === 'active');
  const byId = new Map(active.map((relation) => [relation.relation_id, relation]));

  for (const relation of active) {
    if (!relation.source_site_ref.trim()) {
      issues.push(issue(relation, 'error', 'missing_source_site', 'Relation source_site_ref is required.'));
    }
    if (!relation.target_site_ref.trim()) {
      issues.push(issue(relation, 'error', 'missing_target_site', 'Relation target_site_ref is required.'));
    }
    if (!relation.authority_effect.trim()) {
      issues.push(issue(relation, 'error', 'missing_authority_effect', 'Relation authority_effect is required.'));
    }
    if (relation.reciprocal_relation_id && !byId.has(relation.reciprocal_relation_id)) {
      issues.push(issue(relation, 'error', 'missing_named_reciprocal', `Reciprocal relation is not active: ${relation.reciprocal_relation_id}`));
    }
    if (relation.reciprocal_required && !findReciprocal(relation, active)) {
      issues.push(issue(relation, 'error', 'missing_required_reciprocal', `Missing active reciprocal relation ${relation.target_site_ref} -> ${relation.source_site_ref}.`));
    }
  }

  return issues;
}

export function explainSiteRelation(registry: SiteRelationRegistry, relationId: string): {
  relation: SiteRelationRecord | null;
  authority_moving: boolean;
  evidence_only: boolean;
  reciprocal_satisfied: boolean;
  blockers: string[];
} {
  const relation = registry.relations.find((entry) => entry.relation_id === relationId) ?? null;
  if (!relation) {
    return {
      relation: null,
      authority_moving: false,
      evidence_only: false,
      reciprocal_satisfied: false,
      blockers: [`Relation not found: ${relationId}`],
    };
  }
  const relationIssues = validateSiteRelations(registry).filter((entry) => entry.relation_id === relationId && entry.severity === 'error');
  const reciprocalSatisfied = !relation.reciprocal_required || Boolean(findReciprocal(relation, registry.relations.filter((entry) => entry.status === 'active')));
  return {
    relation,
    authority_moving: /transfer|migration|move/i.test(relation.authority_effect),
    evidence_only: !/transfer|migration|move/i.test(relation.authority_effect),
    reciprocal_satisfied: reciprocalSatisfied,
    blockers: relationIssues.map((entry) => entry.message),
  };
}

function findReciprocal(relation: SiteRelationRecord, active: SiteRelationRecord[]): SiteRelationRecord | undefined {
  if (relation.reciprocal_relation_id) {
    return active.find((entry) => entry.relation_id === relation.reciprocal_relation_id);
  }
  const expectedKind = DEFAULT_RECIPROCAL_KIND[relation.relation_kind];
  return active.find((candidate) =>
    candidate.source_site_ref === relation.target_site_ref
    && candidate.target_site_ref === relation.source_site_ref
    && (!expectedKind || candidate.relation_kind === expectedKind));
}

function defaultAuthorityEffect(kind: SiteRelationKind): string {
  switch (kind) {
    case 'absorbed':
    case 'absorbed_by':
      return 'admission_without_implicit_ownership';
    case 'subscribes_to':
    case 'publishes_to':
    case 'routes_to':
      return 'influence_only';
    case 'references':
      return 'evidence_only_reference';
  }
}

function issue(
  relation: SiteRelationRecord,
  severity: SiteRelationValidationIssue['severity'],
  code: string,
  message: string,
): SiteRelationValidationIssue {
  return {
    relation_id: relation.relation_id,
    severity,
    code,
    message,
  };
}

function requireText(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`${name} is required`);
  return trimmed;
}
