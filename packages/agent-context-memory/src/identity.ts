import type { MechanicalVerificationBasis, RoleCompatibilityIdentity } from './types.js';

export class IdentityDoctrineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdentityDoctrineError';
  }
}

export function assertMechanicalVerificationBasis(basis: MechanicalVerificationBasis): void {
  if (basis.evidenceRefs.length === 0) {
    throw new IdentityDoctrineError('Mechanical verification requires at least one evidence ref');
  }
}

export function assertRoleCompatibilityAdmissions(identities: RoleCompatibilityIdentity[]): void {
  const missing = identities.filter((identity) => identity.admissionRef.trim().length === 0);
  if (missing.length > 0) {
    throw new IdentityDoctrineError(`Role compatibility identities require admission refs: ${missing.map((identity) => identity.compatibilityIdentity).join(', ')}`);
  }
}

export function assertClaimedIdentityIsNotAuthority(claimedIdentity: string | null, basis: MechanicalVerificationBasis): void {
  if (claimedIdentity && basis.evidenceRefs.some((ref) => ref === `claimed_identity:${claimedIdentity}`)) {
    throw new IdentityDoctrineError('Claimed identity cannot be the mechanical verification basis');
  }
}
