const MUTATION_FAMILIES = Object.freeze([
  'task_lifecycle_mutation',
  'inbox_admission',
  'command',
  'site_file_mutation',
]);

export function runtimeAuthorityPostureFromHandoff(handoff = null) {
  const authorityMode = stringOrNull(handoff?.authority_mode ?? handoff?.authority ?? handoff?.mode);
  const authorityRef = stringOrNull(handoff?.authority_ref);
  const writeMode = ['write', 'mutation', 'mutating'].includes(String(authorityMode ?? '').toLowerCase());
  const delegatedMutationAuthority = handoff?.delegated_mutation_authority === true;
  const scope = allowedMutationScope(handoff);
  const hasWriteAuthority = Boolean(authorityRef && (writeMode || delegatedMutationAuthority));
  const admittedFamilies = hasWriteAuthority
    ? (scope.families.length > 0 ? scope.families : [...MUTATION_FAMILIES])
    : [];
  const withheldFamilies = MUTATION_FAMILIES.filter((family) => !admittedFamilies.includes(family));
  return {
    schema: 'narada.runtime_authority_posture.v1',
    mode: hasWriteAuthority
      ? (withheldFamilies.length > 0 ? 'write_partial' : 'write_delegated')
      : 'read_only',
    authority_ref: authorityRef,
    authority_mode: authorityMode,
    admitted_families: admittedFamilies,
    withheld_families: withheldFamilies,
    reason: hasWriteAuthority ? 'delegated_authority_handoff' : missingAuthorityReason(handoff),
  };
}

function allowedMutationScope(handoff) {
  if (!handoff || typeof handoff !== 'object' || Array.isArray(handoff)) return { families: [], tools: [] };
  return {
    families: stringList(handoff.allowed_action_families ?? handoff.mutating_families),
    tools: stringList(handoff.allowed_tools ?? handoff.mutating_tools),
  };
}

function missingAuthorityReason(handoff) {
  if (!handoff) return 'delegated_authority_missing';
  if (!stringOrNull(handoff.authority_ref)) return 'delegated_authority_ref_missing';
  if (!stringOrNull(handoff.authority_mode ?? handoff.authority ?? handoff.mode) && handoff.delegated_mutation_authority !== true) return 'delegated_authority_write_not_granted';
  return 'delegated_authority_unavailable';
}

function stringOrNull(value) {
  return typeof value === 'string' && value ? value : null;
}

function stringList(value) {
  return Array.isArray(value)
    ? value.filter((entry) => typeof entry === 'string' && entry).map((entry) => entry.toLowerCase())
    : [];
}
