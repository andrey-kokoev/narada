export const NARADA_USER_SITE_LOCUS = 'andrey-user';
export const NARADA_PC_SITE_LOCUS = 'narada-pc-site';

export function assertCanonicalSiteLocus(value, fieldName = 'site_locus') {
  if (value === 'narada-andrey' || value === 'narada-user-site') {
    const error = new Error(`legacy_site_locus_rejected:${fieldName}`);
    error.payload = {
      status: 'error',
      error: 'legacy_site_locus_rejected',
      field: fieldName,
      received: value,
      required: NARADA_USER_SITE_LOCUS,
      remediation: 'Use the canonical User Site locus `andrey-user`.',
    };
    throw error;
  }
  return value;
}

export function failAmbiguousSiteLocus(fieldName) {
  const error = new Error(`ambiguous_site_locus: ${fieldName}`);
  error.payload = {
    status: 'error',
    error: 'ambiguous_site_locus',
    field: fieldName,
    accepted_site_loci: [NARADA_USER_SITE_LOCUS, NARADA_PC_SITE_LOCUS],
    remediation: 'Provide an explicit target Site locus or target_site_root.',
  };
  throw error;
}
