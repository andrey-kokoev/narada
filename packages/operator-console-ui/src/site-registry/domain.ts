import type {
  RegistryManagementOperation,
  RegistrySiteRecord,
  SiteRegistryManagementResponse,
  SiteRegistryMutationRequest,
  SiteVariant,
} from '@narada2/site-registry-contract';

export type SiteRegistryPageMode = 'add' | 'manage';

export interface SiteRegistryDraft {
  siteId: string;
  root: string;
  variant: SiteVariant | '';
  substrate: string;
  source: string;
  sourceRef: string;
  reason: string;
  controlEndpoint: string;
  aliases: string;
  aimJson: string;
  clearControlEndpoint: boolean;
  clearAliases: boolean;
  clearAimJson: boolean;
}

export type SiteRegistryValidationField =
  | 'operation'
  | 'reference'
  | 'siteId'
  | 'root'
  | 'reason'
  | 'controlEndpoint'
  | 'aimJson'
  | 'purgeConfirmation';

export type SiteRegistryValidationErrors = Partial<Record<SiteRegistryValidationField, string>>;

export interface SiteRegistryOperationOption {
  value: RegistryManagementOperation;
  label: string;
  enabled: boolean;
}

export interface SiteRegistryDiffRow {
  label: string;
  before: string;
  after: string;
}

export function createSiteRegistryDraft(mode: SiteRegistryPageMode): SiteRegistryDraft {
  return {
    siteId: '',
    root: '',
    variant: mode === 'add' ? 'native' : '',
    substrate: '',
    source: mode === 'add' ? 'manual' : '',
    sourceRef: '',
    reason: '',
    controlEndpoint: '',
    aliases: '',
    aimJson: '',
    clearControlEndpoint: false,
    clearAliases: false,
    clearAimJson: false,
  };
}

export function isManagementOperation(value: string): value is RegistryManagementOperation {
  return value === 'add'
    || value === 'edit'
    || value === 'retire'
    || value === 'restore'
    || value === 'purge';
}

export function isMetadataOperation(operation: RegistryManagementOperation): boolean {
  return operation === 'add' || operation === 'edit';
}

export function isAbsoluteSiteRoot(value: string): boolean {
  return /^(?:[A-Za-z]:[\\/]|\\\\|\/|https?:\/\/)/.test(value);
}

export function aliasesFromDraft(value: string): string[] | undefined {
  const aliases = value.split(',').map((item) => item.trim()).filter(Boolean);
  return aliases.length ? aliases : undefined;
}

export function availableSiteRegistryOperations(
  mode: SiteRegistryPageMode,
  selectedSite: RegistrySiteRecord | null,
): RegistryManagementOperation[] {
  if (mode === 'add') return ['add'];

  const available: RegistryManagementOperation[] = ['add'];
  if (selectedSite?.lifecycleStatus === 'active') available.push('edit', 'retire');
  if (selectedSite?.lifecycleStatus === 'retired') available.push('restore', 'purge');
  return available;
}

export function createSiteRegistryOperationOptions(
  availableOperations: readonly RegistryManagementOperation[],
): SiteRegistryOperationOption[] {
  const available = new Set(availableOperations);
  return [
    { value: 'add', label: 'Add a new Site', enabled: available.has('add') },
    { value: 'edit', label: 'Edit Site metadata', enabled: available.has('edit') },
    { value: 'retire', label: 'Retire a Site', enabled: available.has('retire') },
    { value: 'restore', label: 'Restore a retired Site', enabled: available.has('restore') },
    { value: 'purge', label: 'Purge retired metadata', enabled: available.has('purge') },
  ];
}

export function buildSiteRegistryMutationRequest(
  operation: RegistryManagementOperation,
  draft: SiteRegistryDraft,
  selectedSite: RegistrySiteRecord | null,
  reAdmit: boolean,
): SiteRegistryMutationRequest {
  const request: SiteRegistryMutationRequest = { operation };

  if (operation === 'add') {
    request.site_id = draft.siteId.trim() || undefined;
    request.root = draft.root.trim() || undefined;
    if (draft.variant) request.variant = draft.variant;
    request.substrate = draft.substrate.trim() || undefined;
    request.source = draft.source.trim() || undefined;
    request.source_ref = draft.sourceRef.trim() || undefined;
    request.control_endpoint = draft.controlEndpoint.trim() || undefined;
    request.aliases = aliasesFromDraft(draft.aliases);
    request.aim_json = draft.aimJson.trim() || undefined;
    request.reason = draft.reason.trim() || undefined;
    request.re_admit = reAdmit || undefined;
  } else if (operation === 'edit') {
    request.reference = selectedSite?.siteId || undefined;
    request.root = draft.root.trim() || undefined;
    if (draft.variant) request.variant = draft.variant;
    request.substrate = draft.substrate.trim() || undefined;
    request.source = draft.source.trim() || undefined;
    request.source_ref = draft.sourceRef.trim() || undefined;
    request.reason = draft.reason.trim() || undefined;
    request.control_endpoint = draft.clearControlEndpoint
      ? undefined
      : draft.controlEndpoint.trim() || undefined;
    request.aliases = draft.clearAliases ? undefined : aliasesFromDraft(draft.aliases);
    request.aim_json = draft.clearAimJson ? undefined : draft.aimJson.trim() || undefined;
    request.clear_control_endpoint = draft.clearControlEndpoint || undefined;
    request.clear_aliases = draft.clearAliases || undefined;
    request.clear_aim_json = draft.clearAimJson || undefined;
    request.expected_revision = selectedSite?.revision;
  } else {
    request.reference = selectedSite?.siteId || undefined;
    request.reason = draft.reason.trim() || undefined;
    request.expected_revision = selectedSite?.revision;
  }

  return request;
}

export interface SiteRegistryValidationInput {
  operation: RegistryManagementOperation;
  draft: SiteRegistryDraft;
  selectedReference: string;
  selectedSite: RegistrySiteRecord | null;
  availableOperations: readonly RegistryManagementOperation[];
  forApply?: boolean;
  confirmationRequired?: string;
  purgeConfirmation?: string;
}

export function validateSiteRegistryMutation(
  input: SiteRegistryValidationInput,
): SiteRegistryValidationErrors {
  const {
    operation,
    draft,
    selectedReference,
    selectedSite,
    availableOperations,
    forApply = false,
    confirmationRequired = '',
    purgeConfirmation = '',
  } = input;
  const errors: SiteRegistryValidationErrors = {};

  if (!availableOperations.includes(operation)) {
    errors.operation = selectedSite
      ? 'This operation is not available for the selected Site lifecycle.'
      : 'Choose an existing Site before using this operation.';
  }
  if (operation !== 'add' && !selectedReference) {
    errors.reference = 'Choose an existing Site first.';
  }
  if (operation === 'add') {
    if (!draft.siteId.trim()) {
      errors.siteId = 'Enter a canonical Site ID.';
    } else if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(draft.siteId.trim())) {
      errors.siteId = 'Use letters, numbers, dots, underscores, or hyphens for the Site ID.';
    }
    if (!draft.root.trim()) {
      errors.root = 'Enter the absolute Site root folder.';
    } else if (!isAbsoluteSiteRoot(draft.root.trim())) {
      errors.root = 'Enter an absolute root, such as D:/code/my-site or /home/andrey/my-site.';
    }
  }
  if (['retire', 'restore', 'purge'].includes(operation) && !draft.reason.trim()) {
    errors.reason = 'Enter a reason for this change.';
  }
  if (isMetadataOperation(operation)) {
    const controlEndpoint = draft.controlEndpoint.trim();
    if (controlEndpoint && !controlEndpoint.startsWith('http://') && !controlEndpoint.startsWith('https://')) {
      errors.controlEndpoint = 'Control endpoint must use http:// or https://.';
    }
    if (draft.aimJson.trim() && !draft.clearAimJson) {
      try {
        JSON.parse(draft.aimJson);
      } catch {
        errors.aimJson = 'Purpose metadata must be valid JSON.';
      }
    }
  }
  if (forApply && operation === 'purge'
    && (!confirmationRequired || purgeConfirmation !== confirmationRequired)) {
    errors.purgeConfirmation = 'Type the exact canonical Site ID shown in the preview.';
  }

  return errors;
}

export function formatSiteRegistryValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function toSiteRegistryDiffRows(
  result: SiteRegistryManagementResponse | null,
): SiteRegistryDiffRow[] {
  const before = result?.before;
  const after = result?.after;
  if (!before && !after) return [];

  const fields: Array<{ label: string; before: unknown; after: unknown }> = [
    { label: 'Site ID', before: before?.siteId, after: after?.siteId },
    { label: 'Root', before: before?.siteRoot, after: after?.siteRoot },
    { label: 'Variant', before: before?.variant, after: after?.variant },
    { label: 'Substrate', before: before?.substrate, after: after?.substrate },
    { label: 'Control endpoint', before: before?.controlEndpoint, after: after?.controlEndpoint },
    { label: 'Aliases', before: before?.aliases.map((alias) => alias.value), after: after?.aliases.map((alias) => alias.value) },
    { label: 'Lifecycle', before: before?.lifecycleStatus, after: after?.lifecycleStatus },
    { label: 'Revision', before: before?.revision, after: after?.revision },
  ];

  return fields
    .filter((field) => JSON.stringify(field.before) !== JSON.stringify(field.after))
    .map((field) => ({
      label: field.label,
      before: formatSiteRegistryValue(field.before),
      after: formatSiteRegistryValue(field.after),
    }));
}
