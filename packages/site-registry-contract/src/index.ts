export type SiteVariant = 'native' | 'wsl' | 'cloudflare' | 'linux-user' | 'linux-system';

export type RegistryLifecycleStatus = 'active' | 'retired';

export type RegistryObservationStatus =
  | 'unverified'
  | 'present'
  | 'stale'
  | 'missing'
  | 'conflicted';

export interface RegistrySourceObservation {
  kind: string;
  ref: string;
  observedAt: string;
}

export interface RegistryAlias {
  value: string;
  source: string;
}

export interface RegisteredSite {
  siteId: string;
  variant: SiteVariant;
  siteRoot: string;
  substrate: string;
  aimJson: string | null;
  controlEndpoint: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  lifecycleStatus?: RegistryLifecycleStatus;
  observationStatus?: RegistryObservationStatus;
  sources?: RegistrySourceObservation[];
  aliases?: RegistryAlias[];
  revision?: number;
  updatedAt?: string;
  retiredAt?: string | null;
  retireReason?: string | null;
}

export interface RegistrySiteRecord extends RegisteredSite {
  lifecycleStatus: RegistryLifecycleStatus;
  observationStatus: RegistryObservationStatus;
  sources: RegistrySourceObservation[];
  aliases: RegistryAlias[];
  revision: number;
  updatedAt: string;
  retiredAt: string | null;
  retireReason: string | null;
}

export interface RegistryConflict {
  code: string;
  message: string;
  siteId?: string;
  siteRoot?: string;
}

export type RegistryManagementOperation = 'add' | 'edit' | 'retire' | 'restore' | 'purge';

export interface RegistryManagementRequest {
  operation: RegistryManagementOperation;
  siteId: string;
  actor: string;
  reason?: string;
  siteRoot?: string;
  variant?: SiteVariant;
  substrate?: string;
  aimJson?: string | null;
  controlEndpoint?: string | null;
  aliases?: RegistryAlias[];
  clearAimJson?: boolean;
  clearControlEndpoint?: boolean;
  clearAliases?: boolean;
  source?: RegistrySourceObservation;
  sources?: RegistrySourceObservation[];
  expectedRevision?: number;
  confirmSiteId?: string;
  reAdmit?: boolean;
  apply?: boolean;
}

export interface RegistryManagementResult {
  schema: 'narada.site_registry.management.v0';
  status: 'planned' | 'applied' | 'unchanged' | 'refused';
  operation: RegistryManagementOperation;
  mutationPerformed: boolean;
  siteId: string;
  before: RegistrySiteRecord | null;
  after: RegistrySiteRecord | null;
  changes: string[];
  conflicts: RegistryConflict[];
  refusals: string[];
  auditRef: string | null;
}

export interface RegistryManagementAuditRecord {
  eventId: string;
  siteId: string;
  operation: RegistryManagementOperation;
  actor: string;
  reason: string | null;
  occurredAt: string;
  beforeJson: string | null;
  afterJson: string | null;
  status: 'applied' | 'refused';
}

export interface SiteRegistryWireSite {
  site_id: string;
  site_root: string;
  variant: SiteVariant;
  substrate: string;
  aim_json: string | null;
  control_endpoint: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
  lifecycle_status: RegistryLifecycleStatus;
  observation_status: RegistryObservationStatus;
  sources: Array<{ kind: string; ref: string; observed_at: string }>;
  aliases: Array<{ value: string; source: string }>;
  revision: number;
  retired_at: string | null;
  retire_reason: string | null;
}

export interface SiteRegistryListWireResponse {
  schema: 'narada.site_registry.management.v0';
  status: 'success' | 'refused';
  operation: 'list';
  mutation_performed: false;
  registry_path: string;
  catalog_source: 'user_site_site_registry';
  count: number;
  sites: SiteRegistryWireSite[];
  refusals: string[];
}

export interface SiteRegistryListResponse {
  schema: 'narada.site_registry.management.v0';
  status: 'success' | 'refused';
  operation: 'list';
  mutationPerformed: false;
  registryPath: string;
  catalogSource: 'user_site_site_registry';
  count: number;
  sites: RegistrySiteRecord[];
  refusals: string[];
}

export interface SiteRegistryShowWireResponse {
  schema: 'narada.site_registry.management.v0';
  status: 'success' | 'refused';
  operation: 'show';
  mutation_performed: false;
  site_id: string;
  registry_path: string;
  catalog_source: 'user_site_site_registry';
  site: SiteRegistryWireSite | null;
  management_audit: Array<{
    event_id: string;
    site_id: string;
    operation: RegistryManagementOperation;
    actor: string;
    reason: string | null;
    occurred_at: string;
    before_json: string | null;
    after_json: string | null;
    status: 'applied' | 'refused';
  }>;
  next_actions: string[];
  refusals: string[];
}

export interface SiteRegistryShowResponse {
  schema: 'narada.site_registry.management.v0';
  status: 'success' | 'refused';
  operation: 'show';
  mutationPerformed: false;
  siteId: string;
  registryPath: string;
  catalogSource: 'user_site_site_registry';
  site: RegistrySiteRecord | null;
  managementAudit: RegistryManagementAuditRecord[];
  nextActions: string[];
  refusals: string[];
}

export interface SiteRegistryManagementWireResponse {
  schema: 'narada.site_registry.management.v0';
  status: RegistryManagementResult['status'];
  operation: RegistryManagementOperation;
  mutation_performed: boolean;
  site_id: string;
  registry_path: string;
  catalog_source: 'user_site_site_registry';
  before: SiteRegistryWireSite | null;
  after: SiteRegistryWireSite | null;
  changes: string[];
  conflicts: Array<{ code: string; message: string; site_id?: string; site_root?: string }>;
  refusals: string[];
  audit_ref: string | null;
  confirmation_required?: string | null;
}

export interface SiteRegistryManagementResponse extends Omit<RegistryManagementResult, 'before' | 'after'> {
  registryPath: string;
  catalogSource: 'user_site_site_registry';
  before: RegistrySiteRecord | null;
  after: RegistrySiteRecord | null;
  confirmationRequired: string | null;
}

export interface SiteRegistryMutationRequest {
  operation: RegistryManagementOperation;
  site_id?: string;
  reference?: string;
  root?: string;
  variant?: SiteVariant;
  substrate?: string;
  aim_json?: string;
  control_endpoint?: string;
  clear_aim_json?: boolean;
  clear_control_endpoint?: boolean;
  clear_aliases?: boolean;
  aliases?: string[];
  source?: string;
  source_ref?: string;
  reason?: string;
  re_admit?: boolean;
  actor?: string;
  expected_revision?: number;
  confirm_site_id?: string;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function nullableString(value: unknown): string | null {
  return value === null ? null : stringValue(value);
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : null;
}

function siteVariant(value: unknown): value is SiteVariant {
  return value === 'native'
    || value === 'wsl'
    || value === 'cloudflare'
    || value === 'linux-user'
    || value === 'linux-system';
}

function lifecycleStatus(value: unknown): value is RegistryLifecycleStatus {
  return value === 'active' || value === 'retired';
}

function observationStatus(value: unknown): value is RegistryObservationStatus {
  return value === 'unverified'
    || value === 'present'
    || value === 'stale'
    || value === 'missing'
    || value === 'conflicted';
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function parseWireSources(value: unknown): RegistrySourceObservation[] | null {
  if (!Array.isArray(value)) return null;
  const sources: RegistrySourceObservation[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const kind = stringValue(item.kind);
    const ref = stringValue(item.ref);
    const observedAt = stringValue(item.observed_at);
    if (!kind || !ref || !observedAt) return null;
    sources.push({ kind, ref, observedAt });
  }
  return sources;
}

function parseWireAliases(value: unknown): RegistryAlias[] | null {
  if (!Array.isArray(value)) return null;
  const aliases: RegistryAlias[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const alias = stringValue(item.value);
    const source = stringValue(item.source);
    if (!alias || !source) return null;
    aliases.push({ value: alias, source });
  }
  return aliases;
}

export function parseSiteRegistryWireSite(value: unknown): RegistrySiteRecord | null {
  if (!isRecord(value)) return null;
  const siteId = stringValue(value.site_id);
  const siteRoot = stringValue(value.site_root);
  const variant = value.variant;
  const substrate = stringValue(value.substrate);
  const createdAt = stringValue(value.created_at);
  const updatedAt = stringValue(value.updated_at);
  const lifecycle = value.lifecycle_status;
  const observation = value.observation_status;
  const revision = numberValue(value.revision);
  const sources = parseWireSources(value.sources);
  const aliases = parseWireAliases(value.aliases);
  if (!siteId || !siteRoot || !siteVariant(variant) || !substrate || !createdAt || !updatedAt
    || !lifecycleStatus(lifecycle) || !observationStatus(observation) || revision === null
    || sources === null || aliases === null) return null;
  return {
    siteId,
    siteRoot,
    variant,
    substrate,
    aimJson: nullableString(value.aim_json),
    controlEndpoint: nullableString(value.control_endpoint),
    lastSeenAt: nullableString(value.last_seen_at),
    createdAt,
    updatedAt,
    lifecycleStatus: lifecycle,
    observationStatus: observation,
    sources,
    aliases,
    revision,
    retiredAt: nullableString(value.retired_at),
    retireReason: nullableString(value.retire_reason),
  };
}

function responseHeader(value: unknown, operation: 'list' | 'show'): UnknownRecord | null {
  if (!isRecord(value)
    || value.schema !== 'narada.site_registry.management.v0'
    || value.operation !== operation
    || value.mutation_performed !== false
    || (value.status !== 'success' && value.status !== 'refused')
    || value.catalog_source !== 'user_site_site_registry') return null;
  return value;
}

function responseStatus(value: UnknownRecord): 'success' | 'refused' {
  return value.status === 'success' ? 'success' : 'refused';
}

export function parseSiteRegistryListResponse(value: unknown): SiteRegistryListResponse | null {
  const record = responseHeader(value, 'list');
  if (!record) return null;
  const registryPath = stringValue(record.registry_path);
  const count = numberValue(record.count);
  if (!registryPath || count === null || !Array.isArray(record.sites)) return null;
  const sites: RegistrySiteRecord[] = [];
  for (const site of record.sites) {
    const parsed = parseSiteRegistryWireSite(site);
    if (!parsed) return null;
    sites.push(parsed);
  }
  const refusals = record.refusals === undefined ? [] : stringArray(record.refusals);
  if (refusals === null) return null;
  return {
    schema: 'narada.site_registry.management.v0',
    status: responseStatus(record),
    operation: 'list',
    mutationPerformed: false,
    registryPath,
    catalogSource: 'user_site_site_registry',
    count,
    sites,
    refusals,
  };
}

function parseWireAudit(value: unknown): RegistryManagementAuditRecord | null {
  if (!isRecord(value)) return null;
  const eventId = stringValue(value.event_id);
  const siteId = stringValue(value.site_id);
  const operation = value.operation;
  const actor = stringValue(value.actor);
  const occurredAt = stringValue(value.occurred_at);
  const reason = nullableString(value.reason);
  const beforeJson = nullableString(value.before_json);
  const afterJson = nullableString(value.after_json);
  if (!eventId || !siteId || !isManagementOperation(operation) || !actor || !occurredAt
    || (value.status !== 'applied' && value.status !== 'refused')) return null;
  return { eventId, siteId, operation, actor, reason, occurredAt, beforeJson, afterJson, status: value.status };
}

function isManagementOperation(value: unknown): value is RegistryManagementOperation {
  return value === 'add' || value === 'edit' || value === 'retire' || value === 'restore' || value === 'purge';
}

export function parseSiteRegistryShowResponse(value: unknown): SiteRegistryShowResponse | null {
  const record = responseHeader(value, 'show');
  if (!record) return null;
  const siteId = stringValue(record.site_id);
  const registryPath = stringValue(record.registry_path);
  const nextActions = stringArray(record.next_actions);
  if (!siteId || !registryPath || !nextActions || !Array.isArray(record.management_audit)) return null;
  const site = record.site === null ? null : parseSiteRegistryWireSite(record.site);
  if (record.site !== null && !site) return null;
  const managementAudit: RegistryManagementAuditRecord[] = [];
  for (const entry of record.management_audit) {
    const parsed = parseWireAudit(entry);
    if (!parsed) return null;
    managementAudit.push(parsed);
  }
  const refusals = record.refusals === undefined ? [] : stringArray(record.refusals);
  if (refusals === null) return null;
  return {
    schema: 'narada.site_registry.management.v0',
    status: responseStatus(record),
    operation: 'show',
    mutationPerformed: false,
    siteId,
    registryPath,
    catalogSource: 'user_site_site_registry',
    site,
    managementAudit,
    nextActions,
    refusals,
  };
}

type ManagementEnvelopeRecord = UnknownRecord & {
  status: RegistryManagementResult['status'];
  operation: RegistryManagementOperation;
  mutation_performed: boolean;
};

function managementStatus(value: unknown): value is RegistryManagementResult['status'] {
  return value === 'planned' || value === 'applied' || value === 'unchanged' || value === 'refused';
}

function managementEnvelope(value: unknown): ManagementEnvelopeRecord | null {
  if (!isRecord(value)
    || value.schema !== 'narada.site_registry.management.v0'
    || !isManagementOperation(value.operation)
    || typeof value.mutation_performed !== 'boolean'
    || !managementStatus(value.status)
    || value.catalog_source !== 'user_site_site_registry') return null;
  return value as ManagementEnvelopeRecord;
}

function parseConflicts(value: unknown): RegistryConflict[] | null {
  if (!Array.isArray(value)) return null;
  const conflicts: RegistryConflict[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const code = stringValue(item.code);
    const message = stringValue(item.message);
    if (!code || !message) return null;
    const siteId = item.site_id === undefined ? undefined : stringValue(item.site_id);
    const siteRoot = item.site_root === undefined ? undefined : stringValue(item.site_root);
    if ((item.site_id !== undefined && siteId === null) || (item.site_root !== undefined && siteRoot === null)) return null;
    conflicts.push({ code, message, ...(siteId ? { siteId } : {}), ...(siteRoot ? { siteRoot } : {}) });
  }
  return conflicts;
}

export function parseSiteRegistryManagementResponse(value: unknown): SiteRegistryManagementResponse | null {
  const record = managementEnvelope(value);
  if (!record) return null;
  const siteId = stringValue(record.site_id);
  const registryPath = stringValue(record.registry_path);
  const changes = stringArray(record.changes);
  const refusals = stringArray(record.refusals);
  const conflicts = parseConflicts(record.conflicts);
  const auditRef = nullableString(record.audit_ref);
  if (!siteId || !registryPath || !changes || !refusals || conflicts === null) return null;
  const before = record.before === null ? null : parseSiteRegistryWireSite(record.before);
  const after = record.after === null ? null : parseSiteRegistryWireSite(record.after);
  if (record.before !== null && !before) return null;
  if (record.after !== null && !after) return null;
  const confirmationRequired = record.confirmation_required === undefined
    ? null
    : nullableString(record.confirmation_required);
  if (confirmationRequired === null && record.confirmation_required !== undefined && record.confirmation_required !== null) return null;
  return {
    schema: 'narada.site_registry.management.v0',
    status: record.status,
    operation: record.operation,
    mutationPerformed: record.mutation_performed,
    siteId,
    before,
    after,
    changes,
    conflicts,
    refusals,
    auditRef,
    registryPath,
    catalogSource: 'user_site_site_registry',
    confirmationRequired,
  };
}
