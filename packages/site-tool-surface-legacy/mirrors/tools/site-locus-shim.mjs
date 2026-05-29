export const DEPRECATED_NARADA_ANDREY_SITE = 'narada-andrey';
export const NARADA_USER_SITE_LOCUS = 'narada-user-site';
export const NARADA_PC_SITE_LOCUS = 'narada-pc-site';

export function buildDeprecatedNaradaAndreyShim({
  resolvedSiteLocus = NARADA_USER_SITE_LOCUS,
  resolutionBasis,
  removalCondition,
}) {
  if (![NARADA_USER_SITE_LOCUS, NARADA_PC_SITE_LOCUS].includes(resolvedSiteLocus)) {
    throw new Error(`invalid_resolved_site_locus: ${resolvedSiteLocus}`);
  }
  if (!resolutionBasis || String(resolutionBasis).trim().length === 0) {
    throw new Error('deprecated_narada_andrey_resolution_basis_required');
  }
  return {
    schema: 'narada.site_locus.deprecated_name_shim.v0',
    deprecated_name: DEPRECATED_NARADA_ANDREY_SITE,
    resolved_site_locus: resolvedSiteLocus,
    resolution_basis: resolutionBasis,
    warning: '`narada-andrey` is deprecated as a Site locus; use `narada-user-site` or `narada-pc-site` explicitly.',
    removal_condition: removalCondition
      ?? 'Remove after all mutation-capable callers provide explicit canonical Site locus names.',
  };
}

export function resolveDeprecatedNaradaAndreySiteLocus(value, options = {}) {
  if (value !== DEPRECATED_NARADA_ANDREY_SITE) {
    return { value, shim: null };
  }
  const shim = buildDeprecatedNaradaAndreyShim(options);
  return {
    value: shim.resolved_site_locus,
    shim,
  };
}

export function failAmbiguousDeprecatedNaradaAndreySiteLocus(fieldName) {
  const error = new Error(`ambiguous_deprecated_site_locus: ${fieldName}`);
  error.payload = {
    status: 'error',
    error: 'ambiguous_deprecated_site_locus',
    field: fieldName,
    deprecated_name: DEPRECATED_NARADA_ANDREY_SITE,
    accepted_site_loci: [NARADA_USER_SITE_LOCUS, NARADA_PC_SITE_LOCUS],
    remediation: 'Provide an explicit target Site locus or target_site_root.',
  };
  throw error;
}
