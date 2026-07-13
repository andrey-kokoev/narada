import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { siteRegistryRelationPlanTransitionCommand } from '../../src/commands/site-registry.js';

function tempJson(value: unknown): string {
  const root = join(process.cwd(), '.tmp');
  mkdirSync(root, { recursive: true });
  const dir = mkdtempSync(join(root, 'narada-site-registry-'));
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'relation-transition.json');
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return path;
}

function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    registry_url: 'https://registry.example',
    credential_ref: 'config-ref:NARADA_SITE_REGISTRY_RELATION_ADMIN_TOKEN',
    event_id: 'srrt_test',
    idempotency_key: 'narada-proper:andrey-user:activate:test',
    registry_id: 'site-registry:narada-proper:cloudflare',
    relation_id: 'rel_narada-proper_registry_andrey-user',
    site_id: 'andrey-user',
    subject_site_id: 'andrey-user',
    relation_kind: 'user_locus_site_public_projection',
    transition: 'activate',
    from_state: 'candidate',
    to_state: 'active',
    from_visibility: 'private',
    to_visibility: 'public',
    actor: { kind: 'registry_owner', site_id: 'narada-proper', principal: 'narada.architect' },
    capability_ref: 'capability:site_registry.relation.admin.narada-proper',
    occurred_at: '2026-05-17T21:00:00.000Z',
    reason_codes: ['target_site_local_relation_admitted'],
    evidence_refs: ['andrey-user:task:957'],
    ...overrides,
  };
}

describe('site registry relation planner', () => {
  it('plans a valid relation transition without network or secret resolution', async () => {
    const result = await siteRegistryRelationPlanTransitionCommand({ payloadFile: tempJson(validPayload()) });

    expect(result.exitCode).toBe(0);
    expect(result.result).toMatchObject({
      schema: 'narada.site_registry.relation_transition_plan.v0',
      status: 'planned',
      mutation_performed: false,
      live_network_performed: false,
      credential_resolution: {
        resolved: false,
        posture: 'not_resolved_in_dry_run',
        raw_secret_values_recorded: false,
      },
      transition_preview: {
        site_id: 'andrey-user',
        transition: 'activate',
        capability_ref: 'capability:site_registry.relation.admin.narada-proper',
      },
    });
    expect(JSON.stringify(result.result)).not.toContain('relation-admin-token');
  });

  it('refuses missing evidence without network or mutation', async () => {
    const result = await siteRegistryRelationPlanTransitionCommand({
      payloadFile: tempJson(validPayload({ evidence_refs: [] })),
    });

    expect(result.exitCode).toBe(1);
    expect(result.result).toMatchObject({
      status: 'refused',
      mutation_performed: false,
      live_network_performed: false,
    });
    expect(JSON.stringify(result.result)).toContain('site_registry_relation_evidence_refs_required');
  });

  it('refuses raw-secret markers', async () => {
    const result = await siteRegistryRelationPlanTransitionCommand({
      payloadFile: tempJson(validPayload({ evidence_refs: ['token=relation-admin-token'] })),
    });

    expect(result.exitCode).toBe(1);
    expect(JSON.stringify(result.result)).toContain('site_registry_relation_payload_contains_raw_secret_marker');
    expect(JSON.stringify(result.result)).toContain('site_registry_relation_plan_contains_raw_secret_marker');
  });
});
