import { describe, expect, it } from 'vitest';
import {
  IdentityDoctrineError,
  buildNamedAgentRegistryFragment,
  buildSessionStartContract,
} from '../src/index.js';

const basis = {
  kind: 'operator_admission' as const,
  evidenceRefs: ['OSM:neutral-agent-admission'],
  verifiedAt: '2026-05-10T00:00:00.000Z',
};

describe('agent identity contracts', () => {
  it('separates named agent identity from role assignment and claimed identity', () => {
    const registry = buildNamedAgentRegistryFragment({
      siteId: 'site-alpha',
      namedAgentId: 'site-alpha.agent.kevin',
      displayName: 'Kevin',
      allowedRoleNames: ['architect', 'builder'],
      compatibilityIdentities: [{
        roleName: 'architect',
        compatibilityIdentity: 'site-alpha.architect',
        admissionRef: '.narada/admission/decisions/neutral-role-compatibility.md',
      }],
      mechanicalVerificationBasis: basis,
    });
    const session = buildSessionStartContract({
      siteId: 'site-alpha',
      sessionId: 'sess-neutral-001',
      namedAgentId: registry.namedAgentId,
      roleAssignment: {
        roleName: 'architect',
        assignedBy: 'site-alpha.operator',
        assignmentRef: 'task:neutral-assignment',
      },
      claimedIdentity: 'site-alpha.architect',
      mechanicalVerificationBasis: basis,
    });

    expect(registry.namedAgentId).toBe('site-alpha.agent.kevin');
    expect(session.roleAssignment?.roleName).toBe('architect');
    expect(session.claimedIdentity).toBe('site-alpha.architect');
    expect(session.claimedIdentityIsAuthority).toBe(false);
  });

  it('refuses claimed identity as mechanical authority', () => {
    expect(() => buildSessionStartContract({
      siteId: 'site-alpha',
      sessionId: 'sess-neutral-002',
      namedAgentId: 'site-alpha.agent.kevin',
      claimedIdentity: 'site-alpha.architect',
      mechanicalVerificationBasis: {
        kind: 'operator_admission',
        evidenceRefs: ['claimed_identity:site-alpha.architect'],
      },
    })).toThrow(IdentityDoctrineError);
  });

  it('requires explicit admission for compatibility identities', () => {
    expect(() => buildNamedAgentRegistryFragment({
      siteId: 'site-alpha',
      namedAgentId: 'site-alpha.agent.kevin',
      displayName: 'Kevin',
      allowedRoleNames: ['architect'],
      compatibilityIdentities: [{
        roleName: 'architect',
        compatibilityIdentity: 'site-alpha.architect',
        admissionRef: '',
      }],
      mechanicalVerificationBasis: basis,
    })).toThrow(IdentityDoctrineError);
  });
});
