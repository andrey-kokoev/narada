export const AUTHORITY_GRANT_SCHEMA = 'narada.authority_grant.v1' as const;
export const PROJECTION_TOPOLOGY_SCHEMA = 'narada.runtime_projection_graph.v1' as const;

export type AuthorityGrantState = 'declared' | 'admitted' | 'enforced' | 'revoked' | 'expired';
export type AuthorityGrantTransition = 'admit' | 'enforce' | 'revoke' | 'expire';

export interface AuthorityContractIssue {
  code: string;
  message: string;
  path: Array<string | number>;
}

interface SafeParseSuccess<T> {
  success: true;
  data: T;
}

interface SafeParseFailure {
  success: false;
  error: { issues: AuthorityContractIssue[] };
}

export type SafeParseResult<T> = SafeParseSuccess<T> | SafeParseFailure;

export interface ContractSchema<T> {
  parse(value: unknown): T;
  safeParse(value: unknown): SafeParseResult<T>;
}

export class AuthorityContractError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly issues: AuthorityContractIssue[] = [],
  ) {
    super(message);
    this.name = 'AuthorityContractError';
  }
}

export interface AuthorityPrincipal {
  kind: string;
  id: string;
}

export interface AuthorityOwnerRef extends AuthorityPrincipal {}

export interface GrantScope {
  kind: string;
  ref: string;
  constraints: Record<string, string>;
}

export interface GrantBasis {
  kind: string;
  ref: string;
  reason: string;
}

export interface GrantDeclaration {
  declared_at: string;
  declared_by: AuthorityPrincipal;
  intent_ref: string;
}

export interface GrantAdmission {
  admitted_at: string;
  admitted_by: AuthorityPrincipal;
  authority_ref: string;
  decision_ref: string;
}

export interface GrantEnforcement {
  enforced_at: string;
  enforced_by: AuthorityPrincipal;
  enforcement_ref: string;
  effect_ref: string;
}

export interface GrantExpiry {
  expires_at: string;
}

export interface GrantRevocation {
  revoked_at: string;
  revoked_by: AuthorityPrincipal;
  reason: string;
  evidence_ref: string;
}

export interface AuthorityGrantEvidence {
  kind: string;
  ref: string;
  observed_at?: string;
}

export interface AuthorityGrantAudit {
  created_at: string;
  created_by: AuthorityPrincipal;
  last_transition_at: string;
  last_transition_by: AuthorityPrincipal;
  transition_count: number;
}

export interface AuthorityGrant {
  schema: typeof AUTHORITY_GRANT_SCHEMA;
  grant_id: string;
  owner: AuthorityOwnerRef;
  non_owner_boundary: string;
  grantor: AuthorityPrincipal;
  grantee: AuthorityPrincipal;
  capability: string;
  action: string;
  scope: GrantScope;
  basis: GrantBasis;
  state: AuthorityGrantState;
  declaration: GrantDeclaration;
  admission?: GrantAdmission;
  enforcement?: GrantEnforcement;
  expiry?: GrantExpiry;
  revocation?: GrantRevocation;
  evidence: AuthorityGrantEvidence[];
  audit: AuthorityGrantAudit;
}

export interface AuthorityGrantValidation {
  valid: boolean;
  data?: AuthorityGrant;
  issues: AuthorityContractIssue[];
}

export interface AuthorityGrantTransitionEvent {
  at: string;
  actor: AuthorityPrincipal;
  decision_ref?: string;
  effect_ref?: string;
  reason?: string;
  evidence?: AuthorityGrantEvidence[];
}

export type ProjectionLocation = Record<string, string>;
export type ProjectionRefs = Record<string, string>;
export type ProjectionCursor = Record<string, string | number | boolean>;

export interface ProjectionAuthorityRuntime {
  authority_runtime_id: string;
  kind: string;
  location: ProjectionLocation;
  authority_role: string;
  owner: AuthorityOwnerRef;
  non_owner_boundary: string;
  session_id?: string;
  agent_id?: string;
  endpoint_refs: ProjectionRefs;
  health_ref: string;
  lifecycle_state: string;
}

export interface ProjectionEdge {
  projection_edge_id: string;
  origin_authority_runtime_id: string;
  target_projection_store_id: string;
  kind: string;
  policy_refs: ProjectionRefs;
  credential_refs: ProjectionRefs;
  cursor: ProjectionCursor;
  lifecycle_state: string;
}

export interface ProjectionStore {
  projection_store_id: string;
  kind: string;
  location: ProjectionLocation;
  authority_posture: 'non_canonical_projection';
  freshness_ref: string;
}

export interface ProjectionSurface {
  projection_surface_id: string;
  kind: string;
  location: ProjectionLocation;
  reads_from_projection_store_id: string;
}

export interface IntentRoute {
  intent_route_id: string;
  origin_projection_surface_id: string;
  target_authority_runtime_id: string;
  admitted_methods: string[];
  adapter_methods: string[];
  credential_refs: ProjectionRefs;
  acknowledgement_authority: 'target_authority_runtime';
}

export interface ProjectionTopologyProvenance {
  created_by: string;
  created_at: string;
}

export interface ProjectionTopology {
  schema: typeof PROJECTION_TOPOLOGY_SCHEMA;
  graph_id: string;
  generated_at: string;
  authority_runtimes: ProjectionAuthorityRuntime[];
  projection_edges: ProjectionEdge[];
  projection_stores: ProjectionStore[];
  projection_surfaces: ProjectionSurface[];
  intent_routes: IntentRoute[];
  provenance: ProjectionTopologyProvenance;
}

export interface ProjectionTopologyValidation {
  valid: boolean;
  data?: ProjectionTopology;
  issues: AuthorityContractIssue[];
}

export interface ProjectionTopologyQuery {
  authority_runtime_id?: string;
  projection_edge_id?: string;
  projection_store_id?: string;
  projection_surface_id?: string;
  intent_route_id?: string;
}

export interface ProjectionTopologyQueryResult {
  authority_runtimes: ProjectionAuthorityRuntime[];
  projection_edges: ProjectionEdge[];
  projection_stores: ProjectionStore[];
  projection_surfaces: ProjectionSurface[];
  intent_routes: IntentRoute[];
}

type ValidationResult<T> = SafeParseResult<T>;

function success<T>(data: T): SafeParseSuccess<T> {
  return { success: true, data };
}

function failure(...issues: AuthorityContractIssue[]): SafeParseFailure {
  return { success: false, error: { issues } };
}

function makeSchema<T>(validator: (value: unknown) => ValidationResult<T>): ContractSchema<T> {
  return {
    parse(value: unknown): T {
      const result = validator(value);
      if (!result.success) {
        const message = result.error.issues
          .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
          .join('; ');
        throw new AuthorityContractError('schema_validation_failed', message, result.error.issues);
      }
      return result.data;
    },
    safeParse(value: unknown): ValidationResult<T> {
      return validator(value);
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireData<T>(result: ValidationResult<T>): T {
  if (!result.success) throw new Error('Unexpected authority contract validation failure');
  return result.data;
}

function collectIssues(results: Array<ValidationResult<unknown>>): AuthorityContractIssue[] {
  return results.flatMap((result) => (result.success ? [] : result.error.issues));
}

function validateString(value: unknown, path: Array<string | number>, label: string): ValidationResult<string> {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return failure({ code: 'invalid_string', message: `${label} must be a non-empty string`, path });
  }
  return success(value.trim());
}

function validateLiteral<const T extends string>(value: unknown, expected: T, path: Array<string | number>): ValidationResult<T> {
  const result = validateString(value, path, 'schema');
  if (!result.success) return result;
  if (result.data !== expected) {
    return failure({ code: 'schema_version_mismatch', message: `expected ${expected}`, path });
  }
  return success(expected);
}

function validateIsoDate(value: unknown, path: Array<string | number>, label: string): ValidationResult<string> {
  const result = validateString(value, path, label);
  if (!result.success) return result;
  if (Number.isNaN(new Date(result.data).getTime())) {
    return failure({ code: 'invalid_datetime', message: `${label} must be an ISO datetime`, path });
  }
  return result;
}

function validateEnum<const T extends readonly string[]>(value: unknown, allowed: T, path: Array<string | number>, label: string): ValidationResult<T[number]> {
  const result = validateString(value, path, label);
  if (!result.success) return result as ValidationResult<T[number]>;
  if (!allowed.includes(result.data as T[number])) {
    return failure({ code: 'invalid_enum', message: `${label} must be one of ${allowed.join(', ')}`, path });
  }
  return success(result.data as T[number]);
}

function validateStringMap(value: unknown, path: Array<string | number>, label: string): ValidationResult<Record<string, string>> {
  if (!isRecord(value)) return failure({ code: 'invalid_map', message: `${label} must be an object`, path });
  const result: Record<string, string> = {};
  const issues: AuthorityContractIssue[] = [];
  for (const [key, entry] of Object.entries(value)) {
    const validated = validateString(entry, [...path, key], `${label}.${key}`);
    if (validated.success) result[key] = validated.data;
    else issues.push(...validated.error.issues);
  }
  return issues.length > 0 ? failure(...issues) : success(result);
}

function validateCursor(value: unknown, path: Array<string | number>): ValidationResult<ProjectionCursor> {
  if (!isRecord(value)) return failure({ code: 'invalid_cursor', message: 'cursor must be an object', path });
  const result: ProjectionCursor = {};
  const issues: AuthorityContractIssue[] = [];
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string' && typeof entry !== 'number' && typeof entry !== 'boolean') {
      issues.push({ code: 'invalid_cursor_value', message: 'cursor values must be strings, numbers, or booleans', path: [...path, key] });
    } else {
      result[key] = entry;
    }
  }
  return issues.length > 0 ? failure(...issues) : success(result);
}

function validatePrincipal(value: unknown, path: Array<string | number>, label: string): ValidationResult<AuthorityPrincipal> {
  if (!isRecord(value)) return failure({ code: 'invalid_principal', message: `${label} must be an object`, path });
  const kind = validateString(value.kind, [...path, 'kind'], `${label}.kind`);
  const id = validateString(value.id, [...path, 'id'], `${label}.id`);
  const issues = collectIssues([kind, id]);
  return issues.length > 0 ? failure(...issues) : success({ kind: requireData(kind), id: requireData(id) });
}

function isProjectionPrincipalKind(kind: string): boolean {
  return kind === 'projection_edge' || kind === 'projection_store' || kind === 'projection_surface' || kind.endsWith('_projection_store');
}

function validateOwner(value: unknown, path: Array<string | number>): ValidationResult<AuthorityOwnerRef> {
  const principal = validatePrincipal(value, path, 'owner');
  if (!principal.success) return principal;
  if (isProjectionPrincipalKind(principal.data.kind)) {
    return failure({ code: 'projection_cannot_own_authority', message: 'projection objects cannot own canonical authority', path: [...path, 'kind'] });
  }
  return success(principal.data);
}

function validateScope(value: unknown, path: Array<string | number>): ValidationResult<GrantScope> {
  if (!isRecord(value)) return failure({ code: 'invalid_scope', message: 'scope must be an object', path });
  const kind = validateString(value.kind, [...path, 'kind'], 'scope.kind');
  const ref = validateString(value.ref, [...path, 'ref'], 'scope.ref');
  const constraints = validateStringMap(value.constraints, [...path, 'constraints'], 'scope.constraints');
  const issues = collectIssues([kind, ref, constraints]);
  return issues.length > 0 ? failure(...issues) : success({ kind: requireData(kind), ref: requireData(ref), constraints: requireData(constraints) });
}

function validateBasis(value: unknown, path: Array<string | number>): ValidationResult<GrantBasis> {
  if (!isRecord(value)) return failure({ code: 'invalid_basis', message: 'basis must be an object', path });
  const kind = validateString(value.kind, [...path, 'kind'], 'basis.kind');
  const ref = validateString(value.ref, [...path, 'ref'], 'basis.ref');
  const reason = validateString(value.reason, [...path, 'reason'], 'basis.reason');
  const issues = collectIssues([kind, ref, reason]);
  return issues.length > 0 ? failure(...issues) : success({ kind: requireData(kind), ref: requireData(ref), reason: requireData(reason) });
}

function validateDeclaration(value: unknown, path: Array<string | number>): ValidationResult<GrantDeclaration> {
  if (!isRecord(value)) return failure({ code: 'invalid_declaration', message: 'declaration must be an object', path });
  const declaredAt = validateIsoDate(value.declared_at, [...path, 'declared_at'], 'declaration.declared_at');
  const declaredBy = validatePrincipal(value.declared_by, [...path, 'declared_by'], 'declaration.declared_by');
  const intentRef = validateString(value.intent_ref, [...path, 'intent_ref'], 'declaration.intent_ref');
  const issues = collectIssues([declaredAt, declaredBy, intentRef]);
  return issues.length > 0 ? failure(...issues) : success({ declared_at: requireData(declaredAt), declared_by: requireData(declaredBy), intent_ref: requireData(intentRef) });
}

function validateAdmission(value: unknown, path: Array<string | number>): ValidationResult<GrantAdmission | undefined> {
  if (value === undefined) return success(undefined);
  if (!isRecord(value)) return failure({ code: 'invalid_admission', message: 'admission must be an object', path });
  const admittedAt = validateIsoDate(value.admitted_at, [...path, 'admitted_at'], 'admission.admitted_at');
  const admittedBy = validatePrincipal(value.admitted_by, [...path, 'admitted_by'], 'admission.admitted_by');
  const authorityRef = validateString(value.authority_ref, [...path, 'authority_ref'], 'admission.authority_ref');
  const decisionRef = validateString(value.decision_ref, [...path, 'decision_ref'], 'admission.decision_ref');
  const issues = collectIssues([admittedAt, admittedBy, authorityRef, decisionRef]);
  return issues.length > 0 ? failure(...issues) : success({ admitted_at: requireData(admittedAt), admitted_by: requireData(admittedBy), authority_ref: requireData(authorityRef), decision_ref: requireData(decisionRef) });
}

function validateEnforcement(value: unknown, path: Array<string | number>): ValidationResult<GrantEnforcement | undefined> {
  if (value === undefined) return success(undefined);
  if (!isRecord(value)) return failure({ code: 'invalid_enforcement', message: 'enforcement must be an object', path });
  const enforcedAt = validateIsoDate(value.enforced_at, [...path, 'enforced_at'], 'enforcement.enforced_at');
  const enforcedBy = validatePrincipal(value.enforced_by, [...path, 'enforced_by'], 'enforcement.enforced_by');
  const enforcementRef = validateString(value.enforcement_ref, [...path, 'enforcement_ref'], 'enforcement.enforcement_ref');
  const effectRef = validateString(value.effect_ref, [...path, 'effect_ref'], 'enforcement.effect_ref');
  const issues = collectIssues([enforcedAt, enforcedBy, enforcementRef, effectRef]);
  return issues.length > 0 ? failure(...issues) : success({ enforced_at: requireData(enforcedAt), enforced_by: requireData(enforcedBy), enforcement_ref: requireData(enforcementRef), effect_ref: requireData(effectRef) });
}

function validateExpiry(value: unknown, path: Array<string | number>): ValidationResult<GrantExpiry | undefined> {
  if (value === undefined) return success(undefined);
  if (!isRecord(value)) return failure({ code: 'invalid_expiry', message: 'expiry must be an object', path });
  const expiresAt = validateIsoDate(value.expires_at, [...path, 'expires_at'], 'expiry.expires_at');
  return expiresAt.success ? success({ expires_at: expiresAt.data }) : failure(...expiresAt.error.issues);
}

function validateRevocation(value: unknown, path: Array<string | number>): ValidationResult<GrantRevocation | undefined> {
  if (value === undefined) return success(undefined);
  if (!isRecord(value)) return failure({ code: 'invalid_revocation', message: 'revocation must be an object', path });
  const revokedAt = validateIsoDate(value.revoked_at, [...path, 'revoked_at'], 'revocation.revoked_at');
  const revokedBy = validatePrincipal(value.revoked_by, [...path, 'revoked_by'], 'revocation.revoked_by');
  const reason = validateString(value.reason, [...path, 'reason'], 'revocation.reason');
  const evidenceRef = validateString(value.evidence_ref, [...path, 'evidence_ref'], 'revocation.evidence_ref');
  const issues = collectIssues([revokedAt, revokedBy, reason, evidenceRef]);
  return issues.length > 0 ? failure(...issues) : success({ revoked_at: requireData(revokedAt), revoked_by: requireData(revokedBy), reason: requireData(reason), evidence_ref: requireData(evidenceRef) });
}

function validateEvidence(value: unknown, path: Array<string | number>): ValidationResult<AuthorityGrantEvidence> {
  if (!isRecord(value)) return failure({ code: 'invalid_evidence', message: 'evidence must be an object', path });
  const kind = validateString(value.kind, [...path, 'kind'], 'evidence.kind');
  const ref = validateString(value.ref, [...path, 'ref'], 'evidence.ref');
  const observedAt = value.observed_at === undefined ? success<string | undefined>(undefined) : validateIsoDate(value.observed_at, [...path, 'observed_at'], 'evidence.observed_at');
  const issues = collectIssues([kind, ref, observedAt]);
  return issues.length > 0 ? failure(...issues) : success({ kind: requireData(kind), ref: requireData(ref), ...(requireData(observedAt) === undefined ? {} : { observed_at: requireData(observedAt) }) });
}

function validateEvidenceArray(value: unknown, path: Array<string | number>): ValidationResult<AuthorityGrantEvidence[]> {
  if (!Array.isArray(value) || value.length === 0) return failure({ code: 'evidence_required', message: 'evidence must be a non-empty array', path });
  const entries: AuthorityGrantEvidence[] = [];
  const issues: AuthorityContractIssue[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const result = validateEvidence(value[index], [...path, index]);
    if (result.success) entries.push(result.data);
    else issues.push(...result.error.issues);
  }
  return issues.length > 0 ? failure(...issues) : success(entries);
}

function validateAudit(value: unknown, path: Array<string | number>): ValidationResult<AuthorityGrantAudit> {
  if (!isRecord(value)) return failure({ code: 'invalid_audit', message: 'audit must be an object', path });
  const createdAt = validateIsoDate(value.created_at, [...path, 'created_at'], 'audit.created_at');
  const createdBy = validatePrincipal(value.created_by, [...path, 'created_by'], 'audit.created_by');
  const lastTransitionAt = validateIsoDate(value.last_transition_at, [...path, 'last_transition_at'], 'audit.last_transition_at');
  const lastTransitionBy = validatePrincipal(value.last_transition_by, [...path, 'last_transition_by'], 'audit.last_transition_by');
  const transitionCount = value.transition_count;
  const issues = collectIssues([createdAt, createdBy, lastTransitionAt, lastTransitionBy]);
  if (typeof transitionCount !== 'number' || !Number.isInteger(transitionCount) || transitionCount < 0) {
    issues.push({ code: 'invalid_transition_count', message: 'audit.transition_count must be a non-negative integer', path: [...path, 'transition_count'] });
  }
  return issues.length > 0 ? failure(...issues) : success({ created_at: requireData(createdAt), created_by: requireData(createdBy), last_transition_at: requireData(lastTransitionAt), last_transition_by: requireData(lastTransitionBy), transition_count: transitionCount as number });
}

function validateAuthorityGrantValue(value: unknown): ValidationResult<AuthorityGrant> {
  if (!isRecord(value)) return failure({ code: 'invalid_grant', message: 'AuthorityGrant must be an object', path: [] });
  const schema = validateLiteral(value.schema, AUTHORITY_GRANT_SCHEMA, ['schema']);
  const grantId = validateString(value.grant_id, ['grant_id'], 'grant_id');
  const owner = validateOwner(value.owner, ['owner']);
  const nonOwnerBoundary = validateString(value.non_owner_boundary, ['non_owner_boundary'], 'non_owner_boundary');
  const grantor = validatePrincipal(value.grantor, ['grantor'], 'grantor');
  const grantee = validatePrincipal(value.grantee, ['grantee'], 'grantee');
  const capability = validateString(value.capability, ['capability'], 'capability');
  const action = validateString(value.action, ['action'], 'action');
  const scope = validateScope(value.scope, ['scope']);
  const basis = validateBasis(value.basis, ['basis']);
  const state = validateEnum(value.state, ['declared', 'admitted', 'enforced', 'revoked', 'expired'] as const, ['state'], 'state');
  const declaration = validateDeclaration(value.declaration, ['declaration']);
  const admission = validateAdmission(value.admission, ['admission']);
  const enforcement = validateEnforcement(value.enforcement, ['enforcement']);
  const expiry = validateExpiry(value.expiry, ['expiry']);
  const revocation = validateRevocation(value.revocation, ['revocation']);
  const evidence = validateEvidenceArray(value.evidence, ['evidence']);
  const audit = validateAudit(value.audit, ['audit']);

  const issues = collectIssues([
    schema, grantId, owner, nonOwnerBoundary, grantor, grantee, capability, action,
    scope, basis, state, declaration, admission, enforcement, expiry, revocation, evidence, audit,
  ]);
  if (issues.length > 0) return failure(...issues);

  const grant: AuthorityGrant = {
    schema: requireData(schema),
    grant_id: requireData(grantId),
    owner: requireData(owner),
    non_owner_boundary: requireData(nonOwnerBoundary),
    grantor: requireData(grantor),
    grantee: requireData(grantee),
    capability: requireData(capability),
    action: requireData(action),
    scope: requireData(scope),
    basis: requireData(basis),
    state: requireData(state),
    declaration: requireData(declaration),
    admission: requireData(admission),
    enforcement: requireData(enforcement),
    expiry: requireData(expiry),
    revocation: requireData(revocation),
    evidence: requireData(evidence),
    audit: requireData(audit),
  };

  const coherenceIssues: AuthorityContractIssue[] = [];
  if (isProjectionPrincipalKind(grant.grantor.kind)) coherenceIssues.push({ code: 'projection_cannot_grant_authority', message: 'projection objects cannot mint AuthorityGrant records', path: ['grantor', 'kind'] });
  if (isProjectionPrincipalKind(grant.grantee.kind)) coherenceIssues.push({ code: 'projection_cannot_receive_authority', message: 'projection objects cannot be granted canonical authority', path: ['grantee', 'kind'] });
  if (grant.state === 'declared' && (grant.admission !== undefined || grant.enforcement !== undefined)) coherenceIssues.push({ code: 'declaration_admission_overlap', message: 'declared grants cannot carry admission or enforcement', path: ['state'] });
  if (grant.state === 'admitted' && (grant.admission === undefined || grant.enforcement !== undefined)) coherenceIssues.push({ code: 'admission_phase_invalid', message: 'admitted grants require admission and cannot be enforced yet', path: ['state'] });
  if (grant.state === 'enforced' && (grant.admission === undefined || grant.enforcement === undefined)) coherenceIssues.push({ code: 'enforcement_phase_invalid', message: 'enforced grants require both admission and enforcement', path: ['state'] });
  if ((grant.state === 'revoked') !== (grant.revocation !== undefined)) coherenceIssues.push({ code: 'revocation_state_mismatch', message: 'revocation data must exist exactly when state is revoked', path: ['revocation'] });
  if (grant.state === 'expired' && grant.expiry === undefined) coherenceIssues.push({ code: 'expiry_state_missing_expiry', message: 'expired grants require expiry data', path: ['expiry'] });
  if (grant.enforcement !== undefined && grant.admission === undefined) coherenceIssues.push({ code: 'enforcement_without_admission', message: 'enforcement cannot exist before admission', path: ['enforcement'] });
  if (grant.audit.transition_count < 0) coherenceIssues.push({ code: 'invalid_audit_state', message: 'audit transition count cannot be negative', path: ['audit', 'transition_count'] });
  return coherenceIssues.length > 0 ? failure(...coherenceIssues) : success(grant);
}

function validateTransitionEvent(value: unknown): ValidationResult<AuthorityGrantTransitionEvent> {
  if (!isRecord(value)) return failure({ code: 'invalid_transition_event', message: 'transition event must be an object', path: [] });
  const at = validateIsoDate(value.at, ['at'], 'event.at');
  const actor = validatePrincipal(value.actor, ['actor'], 'event.actor');
  const decisionRef = value.decision_ref === undefined ? success<string | undefined>(undefined) : validateString(value.decision_ref, ['decision_ref'], 'event.decision_ref');
  const effectRef = value.effect_ref === undefined ? success<string | undefined>(undefined) : validateString(value.effect_ref, ['effect_ref'], 'event.effect_ref');
  const reason = value.reason === undefined ? success<string | undefined>(undefined) : validateString(value.reason, ['reason'], 'event.reason');
  const evidence = value.evidence === undefined ? success<AuthorityGrantEvidence[] | undefined>(undefined) : validateEvidenceArray(value.evidence, ['evidence']);
  const issues = collectIssues([at, actor, decisionRef, effectRef, reason, evidence]);
  if (issues.length > 0) return failure(...issues);
  const event: AuthorityGrantTransitionEvent = { at: requireData(at), actor: requireData(actor) };
  const decisionRefValue = requireData(decisionRef);
  const effectRefValue = requireData(effectRef);
  const reasonValue = requireData(reason);
  const evidenceValue = requireData(evidence);
  if (decisionRefValue !== undefined) event.decision_ref = decisionRefValue;
  if (effectRefValue !== undefined) event.effect_ref = effectRefValue;
  if (reasonValue !== undefined) event.reason = reasonValue;
  if (evidenceValue !== undefined) event.evidence = evidenceValue;
  return success(event);
}

export const authorityGrantSchema = makeSchema<AuthorityGrant>(validateAuthorityGrantValue);

export function validateAuthorityGrant(value: unknown): AuthorityGrantValidation {
  const result = authorityGrantSchema.safeParse(value);
  return result.success ? { valid: true, data: result.data, issues: [] } : { valid: false, issues: result.error.issues };
}

export function transitionAuthorityGrant(
  grant: AuthorityGrant,
  transition: AuthorityGrantTransition,
  event: AuthorityGrantTransitionEvent,
): AuthorityGrant {
  const current = authorityGrantSchema.parse(grant);
  const transitionEventResult = validateTransitionEvent(event);
  if (!transitionEventResult.success) {
    throw new AuthorityContractError('invalid_transition_event', 'The transition event is invalid', transitionEventResult.error.issues);
  }
  const transitionEvent = transitionEventResult.data;
  if (isProjectionPrincipalKind(transitionEvent.actor.kind)) {
    throw new AuthorityContractError('projection_cannot_transition_authority', 'Projection objects cannot admit, enforce, revoke, or expire authority');
  }
  if (transitionEvent.actor.id !== current.owner.id) {
    throw new AuthorityContractError('authority_owner_required', 'Only the canonical authority owner may transition this grant');
  }

  const transitionCount = current.audit.transition_count + 1;
  const audit: AuthorityGrantAudit = {
    ...current.audit,
    last_transition_at: transitionEvent.at,
    last_transition_by: transitionEvent.actor,
    transition_count: transitionCount,
  };
  let next: AuthorityGrant;

  if (transition === 'admit') {
    if (current.state !== 'declared') throw new AuthorityContractError('invalid_authority_grant_transition', 'Only declared grants may be admitted');
    next = {
      ...current,
      state: 'admitted',
      admission: {
        admitted_at: transitionEvent.at,
        admitted_by: transitionEvent.actor,
        authority_ref: current.owner.id,
        decision_ref: transitionEvent.decision_ref ?? current.grant_id,
      },
      audit,
    };
  } else if (transition === 'enforce') {
    if (current.state !== 'admitted') throw new AuthorityContractError('invalid_authority_grant_transition', 'Only admitted grants may be enforced');
    if (transitionEvent.effect_ref === undefined) throw new AuthorityContractError('enforcement_effect_required', 'Enforcement requires an effect reference');
    next = {
      ...current,
      state: 'enforced',
      enforcement: {
        enforced_at: transitionEvent.at,
        enforced_by: transitionEvent.actor,
        enforcement_ref: transitionEvent.decision_ref ?? current.grant_id,
        effect_ref: transitionEvent.effect_ref,
      },
      audit,
    };
  } else if (transition === 'revoke') {
    if (current.state === 'revoked' || current.state === 'expired') throw new AuthorityContractError('invalid_authority_grant_transition', 'Terminal grants cannot be revoked');
    if (transitionEvent.reason === undefined) throw new AuthorityContractError('revocation_reason_required', 'Revocation requires a reason');
    next = {
      ...current,
      state: 'revoked',
      revocation: {
        revoked_at: transitionEvent.at,
        revoked_by: transitionEvent.actor,
        reason: transitionEvent.reason,
        evidence_ref: transitionEvent.decision_ref ?? current.grant_id,
      },
      audit,
    };
  } else {
    if (current.state === 'revoked' || current.state === 'expired') throw new AuthorityContractError('invalid_authority_grant_transition', 'Terminal grants cannot expire');
    if (current.expiry === undefined) throw new AuthorityContractError('expiry_required', 'Expiry requires an expiry timestamp');
    if (new Date(transitionEvent.at).getTime() < new Date(current.expiry.expires_at).getTime()) throw new AuthorityContractError('expiry_not_reached', 'The grant expiry timestamp has not been reached');
    next = { ...current, state: 'expired', audit };
  }

  const evidence = transitionEvent.evidence === undefined ? current.evidence : [...current.evidence, ...transitionEvent.evidence];
  return authorityGrantSchema.parse({ ...next, evidence });
}

function validateLocation(value: unknown, path: Array<string | number>): ValidationResult<ProjectionLocation> {
  return validateStringMap(value, path, 'location');
}

function validateAuthorityRuntime(value: unknown, path: Array<string | number>): ValidationResult<ProjectionAuthorityRuntime> {
  if (!isRecord(value)) return failure({ code: 'invalid_authority_runtime', message: 'authority runtime must be an object', path });
  const id = validateString(value.authority_runtime_id, [...path, 'authority_runtime_id'], 'authority_runtime_id');
  const kind = validateString(value.kind, [...path, 'kind'], 'kind');
  const location = validateLocation(value.location, [...path, 'location']);
  const role = validateString(value.authority_role, [...path, 'authority_role'], 'authority_role');
  const owner = validateOwner(value.owner, [...path, 'owner']);
  const boundary = validateString(value.non_owner_boundary, [...path, 'non_owner_boundary'], 'non_owner_boundary');
  const sessionId = value.session_id === undefined ? success<string | undefined>(undefined) : validateString(value.session_id, [...path, 'session_id'], 'session_id');
  const agentId = value.agent_id === undefined ? success<string | undefined>(undefined) : validateString(value.agent_id, [...path, 'agent_id'], 'agent_id');
  const endpoints = validateStringMap(value.endpoint_refs, [...path, 'endpoint_refs'], 'endpoint_refs');
  const health = validateString(value.health_ref, [...path, 'health_ref'], 'health_ref');
  const lifecycle = validateString(value.lifecycle_state, [...path, 'lifecycle_state'], 'lifecycle_state');
  const issues = collectIssues([id, kind, location, role, owner, boundary, sessionId, agentId, endpoints, health, lifecycle]);
  if (issues.length > 0) return failure(...issues);
  return success({
    authority_runtime_id: requireData(id),
    kind: requireData(kind),
    location: requireData(location),
    authority_role: requireData(role),
    owner: requireData(owner),
    non_owner_boundary: requireData(boundary),
    ...(requireData(sessionId) === undefined ? {} : { session_id: requireData(sessionId) }),
    ...(requireData(agentId) === undefined ? {} : { agent_id: requireData(agentId) }),
    endpoint_refs: requireData(endpoints),
    health_ref: requireData(health),
    lifecycle_state: requireData(lifecycle),
  });
}

function validateProjectionEdge(value: unknown, path: Array<string | number>): ValidationResult<ProjectionEdge> {
  if (!isRecord(value)) return failure({ code: 'invalid_projection_edge', message: 'projection edge must be an object', path });
  const id = validateString(value.projection_edge_id, [...path, 'projection_edge_id'], 'projection_edge_id');
  const origin = validateString(value.origin_authority_runtime_id, [...path, 'origin_authority_runtime_id'], 'origin_authority_runtime_id');
  const target = validateString(value.target_projection_store_id, [...path, 'target_projection_store_id'], 'target_projection_store_id');
  const kind = validateString(value.kind, [...path, 'kind'], 'kind');
  const policies = validateStringMap(value.policy_refs, [...path, 'policy_refs'], 'policy_refs');
  const credentials = validateStringMap(value.credential_refs, [...path, 'credential_refs'], 'credential_refs');
  const cursor = validateCursor(value.cursor, [...path, 'cursor']);
  const lifecycle = validateString(value.lifecycle_state, [...path, 'lifecycle_state'], 'lifecycle_state');
  const issues = collectIssues([id, origin, target, kind, policies, credentials, cursor, lifecycle]);
  if (issues.length > 0) return failure(...issues);
  return success({ projection_edge_id: requireData(id), origin_authority_runtime_id: requireData(origin), target_projection_store_id: requireData(target), kind: requireData(kind), policy_refs: requireData(policies), credential_refs: requireData(credentials), cursor: requireData(cursor), lifecycle_state: requireData(lifecycle) });
}

function validateProjectionStore(value: unknown, path: Array<string | number>): ValidationResult<ProjectionStore> {
  if (!isRecord(value)) return failure({ code: 'invalid_projection_store', message: 'projection store must be an object', path });
  const id = validateString(value.projection_store_id, [...path, 'projection_store_id'], 'projection_store_id');
  const kind = validateString(value.kind, [...path, 'kind'], 'kind');
  const location = validateLocation(value.location, [...path, 'location']);
  if (value.authority_posture !== 'non_canonical_projection') {
    return failure({ code: 'projection_store_cannot_be_canonical', message: 'projection stores must remain non-canonical projections', path: [...path, 'authority_posture'] });
  }
  const posture = validateLiteral(value.authority_posture, 'non_canonical_projection', [...path, 'authority_posture']);
  const freshness = validateString(value.freshness_ref, [...path, 'freshness_ref'], 'freshness_ref');
  const issues = collectIssues([id, kind, location, posture, freshness]);
  return issues.length > 0 ? failure(...issues) : success({ projection_store_id: requireData(id), kind: requireData(kind), location: requireData(location), authority_posture: requireData(posture), freshness_ref: requireData(freshness) });
}

function validateProjectionSurface(value: unknown, path: Array<string | number>): ValidationResult<ProjectionSurface> {
  if (!isRecord(value)) return failure({ code: 'invalid_projection_surface', message: 'projection surface must be an object', path });
  const id = validateString(value.projection_surface_id, [...path, 'projection_surface_id'], 'projection_surface_id');
  const kind = validateString(value.kind, [...path, 'kind'], 'kind');
  const location = validateLocation(value.location, [...path, 'location']);
  const store = validateString(value.reads_from_projection_store_id, [...path, 'reads_from_projection_store_id'], 'reads_from_projection_store_id');
  const issues = collectIssues([id, kind, location, store]);
  return issues.length > 0 ? failure(...issues) : success({ projection_surface_id: requireData(id), kind: requireData(kind), location: requireData(location), reads_from_projection_store_id: requireData(store) });
}

function validateIntentRoute(value: unknown, path: Array<string | number>): ValidationResult<IntentRoute> {
  if (!isRecord(value)) return failure({ code: 'invalid_intent_route', message: 'intent route must be an object', path });
  const id = validateString(value.intent_route_id, [...path, 'intent_route_id'], 'intent_route_id');
  const origin = validateString(value.origin_projection_surface_id, [...path, 'origin_projection_surface_id'], 'origin_projection_surface_id');
  const target = validateString(value.target_authority_runtime_id, [...path, 'target_authority_runtime_id'], 'target_authority_runtime_id');
  const admitted = validateStringArray(value.admitted_methods, [...path, 'admitted_methods'], 'admitted_methods');
  const adapters = validateStringArray(value.adapter_methods, [...path, 'adapter_methods'], 'adapter_methods');
  const credentials = validateStringMap(value.credential_refs, [...path, 'credential_refs'], 'credential_refs');
  const acknowledgement = validateLiteral(value.acknowledgement_authority, 'target_authority_runtime', [...path, 'acknowledgement_authority']);
  const issues = collectIssues([id, origin, target, admitted, adapters, credentials, acknowledgement]);
  return issues.length > 0 ? failure(...issues) : success({ intent_route_id: requireData(id), origin_projection_surface_id: requireData(origin), target_authority_runtime_id: requireData(target), admitted_methods: requireData(admitted), adapter_methods: requireData(adapters), credential_refs: requireData(credentials), acknowledgement_authority: requireData(acknowledgement) });
}

function validateStringArray(value: unknown, path: Array<string | number>, label: string): ValidationResult<string[]> {
  if (!Array.isArray(value) || value.length === 0) return failure({ code: 'non_empty_array_required', message: `${label} must be a non-empty array`, path });
  const entries: string[] = [];
  const issues: AuthorityContractIssue[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const entry = validateString(value[index], [...path, index], `${label}[${index}]`);
    if (entry.success) entries.push(entry.data);
    else issues.push(...entry.error.issues);
  }
  return issues.length > 0 ? failure(...issues) : success(entries);
}

function validateProvenance(value: unknown, path: Array<string | number>): ValidationResult<ProjectionTopologyProvenance> {
  if (!isRecord(value)) return failure({ code: 'invalid_provenance', message: 'provenance must be an object', path });
  const createdBy = validateString(value.created_by, [...path, 'created_by'], 'provenance.created_by');
  const createdAt = validateIsoDate(value.created_at, [...path, 'created_at'], 'provenance.created_at');
  const issues = collectIssues([createdBy, createdAt]);
  return issues.length > 0 ? failure(...issues) : success({ created_by: requireData(createdBy), created_at: requireData(createdAt) });
}

function validateArray<T>(value: unknown, path: Array<string | number>, validator: (entry: unknown, entryPath: Array<string | number>) => ValidationResult<T>, label: string): ValidationResult<T[]> {
  if (!Array.isArray(value)) return failure({ code: 'invalid_array', message: `${label} must be an array`, path });
  const entries: T[] = [];
  const issues: AuthorityContractIssue[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const entry = validator(value[index], [...path, index]);
    if (entry.success) entries.push(entry.data);
    else issues.push(...entry.error.issues);
  }
  return issues.length > 0 ? failure(...issues) : success(entries);
}

function duplicateIssues<T>(entries: T[], key: (entry: T) => string, path: Array<string | number>, code: string): AuthorityContractIssue[] {
  const seen = new Set<string>();
  const issues: AuthorityContractIssue[] = [];
  entries.forEach((entry, index) => {
    const value = key(entry);
    if (seen.has(value)) issues.push({ code, message: `duplicate identity ${value}`, path: [...path, index] });
    seen.add(value);
  });
  return issues;
}

function validateProjectionTopologyValue(value: unknown): ValidationResult<ProjectionTopology> {
  if (!isRecord(value)) return failure({ code: 'invalid_projection_topology', message: 'ProjectionTopology must be an object', path: [] });
  const schema = validateLiteral(value.schema, PROJECTION_TOPOLOGY_SCHEMA, ['schema']);
  const graphId = validateString(value.graph_id, ['graph_id'], 'graph_id');
  const generatedAt = validateIsoDate(value.generated_at, ['generated_at'], 'generated_at');
  const authorities = validateArray(value.authority_runtimes, ['authority_runtimes'], validateAuthorityRuntime, 'authority_runtimes');
  const edges = validateArray(value.projection_edges, ['projection_edges'], validateProjectionEdge, 'projection_edges');
  const stores = validateArray(value.projection_stores, ['projection_stores'], validateProjectionStore, 'projection_stores');
  const surfaces = validateArray(value.projection_surfaces, ['projection_surfaces'], validateProjectionSurface, 'projection_surfaces');
  const routes = validateArray(value.intent_routes, ['intent_routes'], validateIntentRoute, 'intent_routes');
  const provenance = validateProvenance(value.provenance, ['provenance']);
  const issues = collectIssues([schema, graphId, generatedAt, authorities, edges, stores, surfaces, routes, provenance]);
  if (issues.length > 0) return failure(...issues);

  const topology: ProjectionTopology = {
    schema: requireData(schema),
    graph_id: requireData(graphId),
    generated_at: requireData(generatedAt),
    authority_runtimes: requireData(authorities),
    projection_edges: requireData(edges),
    projection_stores: requireData(stores),
    projection_surfaces: requireData(surfaces),
    intent_routes: requireData(routes),
    provenance: requireData(provenance),
  };
  const coherenceIssues = [
    ...duplicateIssues(topology.authority_runtimes, (entry) => entry.authority_runtime_id, ['authority_runtimes'], 'duplicate_authority_runtime_id'),
    ...duplicateIssues(topology.projection_edges, (entry) => entry.projection_edge_id, ['projection_edges'], 'duplicate_projection_edge_id'),
    ...duplicateIssues(topology.projection_stores, (entry) => entry.projection_store_id, ['projection_stores'], 'duplicate_projection_store_id'),
    ...duplicateIssues(topology.projection_surfaces, (entry) => entry.projection_surface_id, ['projection_surfaces'], 'duplicate_projection_surface_id'),
    ...duplicateIssues(topology.intent_routes, (entry) => entry.intent_route_id, ['intent_routes'], 'duplicate_intent_route_id'),
  ];
  const authorityIds = new Set(topology.authority_runtimes.map((entry) => entry.authority_runtime_id));
  const storeIds = new Set(topology.projection_stores.map((entry) => entry.projection_store_id));
  const surfaceIds = new Set(topology.projection_surfaces.map((entry) => entry.projection_surface_id));
  topology.projection_edges.forEach((edge, index) => {
    if (!authorityIds.has(edge.origin_authority_runtime_id)) coherenceIssues.push({ code: 'edge_origin_not_found', message: 'projection edge origin must identify an authority runtime', path: ['projection_edges', index, 'origin_authority_runtime_id'] });
    if (!storeIds.has(edge.target_projection_store_id)) coherenceIssues.push({ code: 'edge_target_not_found', message: 'projection edge target must identify a projection store', path: ['projection_edges', index, 'target_projection_store_id'] });
  });
  topology.projection_surfaces.forEach((surface, index) => {
    if (!storeIds.has(surface.reads_from_projection_store_id)) coherenceIssues.push({ code: 'surface_store_not_found', message: 'projection surface must read from a known projection store', path: ['projection_surfaces', index, 'reads_from_projection_store_id'] });
  });
  topology.intent_routes.forEach((route, index) => {
    if (!surfaceIds.has(route.origin_projection_surface_id)) coherenceIssues.push({ code: 'route_origin_not_found', message: 'intent route origin must identify a projection surface', path: ['intent_routes', index, 'origin_projection_surface_id'] });
    if (!authorityIds.has(route.target_authority_runtime_id)) coherenceIssues.push({ code: 'route_target_not_found', message: 'intent route target must identify an authority runtime', path: ['intent_routes', index, 'target_authority_runtime_id'] });
  });
  return coherenceIssues.length > 0 ? failure(...coherenceIssues) : success(topology);
}

export const projectionTopologySchema = makeSchema<ProjectionTopology>(validateProjectionTopologyValue);

export function validateProjectionTopology(value: unknown): ProjectionTopologyValidation {
  const result = projectionTopologySchema.safeParse(value);
  return result.success ? { valid: true, data: result.data, issues: [] } : { valid: false, issues: result.error.issues };
}

export function queryProjectionTopology(topology: ProjectionTopology, query: ProjectionTopologyQuery = {}): ProjectionTopologyQueryResult {
  const canonical = projectionTopologySchema.parse(topology);
  const hasQuery = Object.values(query).some((value) => value !== undefined);
  const directSurface = query.projection_surface_id === undefined
    ? undefined
    : canonical.projection_surfaces.find((entry) => entry.projection_surface_id === query.projection_surface_id);
  const directRoute = query.intent_route_id === undefined
    ? undefined
    : canonical.intent_routes.find((entry) => entry.intent_route_id === query.intent_route_id);
  const routeSurface = directRoute === undefined
    ? undefined
    : canonical.projection_surfaces.find((entry) => entry.projection_surface_id === directRoute.origin_projection_surface_id);
  const selectedSurface = directSurface ?? routeSurface;
  const selectedStoreIds = new Set<string>();
  if (query.projection_store_id !== undefined) selectedStoreIds.add(query.projection_store_id);
  if (selectedSurface !== undefined) selectedStoreIds.add(selectedSurface.reads_from_projection_store_id);

  let edges = canonical.projection_edges.filter((entry) =>
    (query.projection_edge_id === undefined || entry.projection_edge_id === query.projection_edge_id) &&
    (query.authority_runtime_id === undefined || entry.origin_authority_runtime_id === query.authority_runtime_id) &&
    (query.projection_store_id === undefined || entry.target_projection_store_id === query.projection_store_id),
  );
  if (query.projection_edge_id !== undefined || query.authority_runtime_id !== undefined || query.projection_store_id !== undefined || selectedSurface !== undefined) {
    edges = edges.filter((entry) => selectedStoreIds.size === 0 || selectedStoreIds.has(entry.target_projection_store_id));
    for (const edge of edges) selectedStoreIds.add(edge.target_projection_store_id);
  }

  const stores = canonical.projection_stores.filter((entry) => !hasQuery || selectedStoreIds.size === 0 || selectedStoreIds.has(entry.projection_store_id));
  const storeIds = new Set(stores.map((entry) => entry.projection_store_id));
  const surfaces = canonical.projection_surfaces.filter((entry) =>
    (!hasQuery || selectedSurface !== undefined || storeIds.size === 0 || storeIds.has(entry.reads_from_projection_store_id)) &&
    (query.projection_surface_id === undefined || entry.projection_surface_id === query.projection_surface_id),
  );
  const surfaceIds = new Set(surfaces.map((entry) => entry.projection_surface_id));
  const authorityIds = new Set<string>();
  if (query.authority_runtime_id !== undefined) authorityIds.add(query.authority_runtime_id);
  if (query.authority_runtime_id === undefined && (query.projection_edge_id !== undefined || query.projection_store_id !== undefined || selectedSurface !== undefined)) {
    for (const edge of edges) authorityIds.add(edge.origin_authority_runtime_id);
  }
  if (query.authority_runtime_id === undefined && directRoute !== undefined) authorityIds.add(directRoute.target_authority_runtime_id);
  const authorityRuntimes = canonical.authority_runtimes.filter((entry) => !hasQuery || authorityIds.size === 0 || authorityIds.has(entry.authority_runtime_id));
  const routes = canonical.intent_routes.filter((entry) =>
    (query.intent_route_id === undefined || entry.intent_route_id === query.intent_route_id) &&
    (query.projection_surface_id === undefined || surfaceIds.has(entry.origin_projection_surface_id)) &&
    (query.authority_runtime_id === undefined || entry.target_authority_runtime_id === query.authority_runtime_id) &&
    (query.projection_store_id === undefined && query.projection_edge_id === undefined || surfaceIds.has(entry.origin_projection_surface_id)),
  );
  return { authority_runtimes: authorityRuntimes, projection_edges: edges, projection_stores: stores, projection_surfaces: surfaces, intent_routes: routes };
}
