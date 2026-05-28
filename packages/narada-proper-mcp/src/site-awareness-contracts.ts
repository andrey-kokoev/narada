export interface SiteProbePlan {
  schema: 'narada.site_probe.plan.v0';
  status: 'planned_descriptor' | 'refused';
  root?: string;
  authority_basis?: string;
  refusals: string[];
  target_mutated: false;
  arbitrary_scan_performed: false;
}

export interface SiteIdentityPosture {
  schema: 'narada.site_identity.posture.v0';
  site_id: string;
  public_identity_document_ref: string;
  private_key_storage: 'outside_public_site_artifacts';
  trust_pin_required: true;
  trust_status: 'untrusted_observed' | 'trusted_pinned';
  can_sign: false;
}

export interface AdvisoryLiftPacket {
  schema: 'narada.lift.advisory_packet.v0';
  status: 'advisory_requires_receiving_site_admission' | 'refused';
  source_ref: string;
  stale_source_detected: boolean;
  non_portable_path_refused: boolean;
  receiving_site_admission_required: true;
  target_mutated: false;
}

export function planReadOnlySiteProbe(input: {
  root?: string;
  registered?: boolean;
  operator_authority_basis?: string;
  arbitrary_scan_requested?: boolean;
}): SiteProbePlan {
  const refusals: string[] = [];
  if (input.root && !input.registered && !input.operator_authority_basis) {
    refusals.push('unregistered_root_requires_operator_authority_basis');
  }
  if (input.arbitrary_scan_requested) refusals.push('arbitrary_scan_refused');
  return {
    schema: 'narada.site_probe.plan.v0',
    status: refusals.length ? 'refused' : 'planned_descriptor',
    root: input.root,
    authority_basis: input.operator_authority_basis,
    refusals,
    target_mutated: false,
    arbitrary_scan_performed: false,
  };
}

export function observeSiteIdentity(input: {
  site_id: string;
  public_identity_document_ref: string;
  trust_pinned?: boolean;
}): SiteIdentityPosture {
  return {
    schema: 'narada.site_identity.posture.v0',
    site_id: input.site_id,
    public_identity_document_ref: input.public_identity_document_ref,
    private_key_storage: 'outside_public_site_artifacts',
    trust_pin_required: true,
    trust_status: input.trust_pinned ? 'trusted_pinned' : 'untrusted_observed',
    can_sign: false,
  };
}

export function buildAdvisoryLiftPacket(input: {
  source_ref: string;
  source_fresh?: boolean;
  portable_path?: boolean;
}): AdvisoryLiftPacket {
  const stale = input.source_fresh === false;
  const nonPortable = input.portable_path === false || /^[A-Z]:\\/i.test(input.source_ref);
  return {
    schema: 'narada.lift.advisory_packet.v0',
    status: nonPortable ? 'refused' : 'advisory_requires_receiving_site_admission',
    source_ref: input.source_ref,
    stale_source_detected: stale,
    non_portable_path_refused: nonPortable,
    receiving_site_admission_required: true,
    target_mutated: false,
  };
}
