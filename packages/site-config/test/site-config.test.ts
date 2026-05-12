import { describe, expect, it } from 'vitest';
import {
  buildRegisteredSiteProbeReport,
  buildRegisteredSiteProbeRequest,
  decideRegisteredSiteProbe,
  validateKnownSiteRegistryEntry,
  type KnownSiteRegistryEntry,
} from '../src/index.js';

function knownSite(overrides: Partial<KnownSiteRegistryEntry> = {}): KnownSiteRegistryEntry {
  return {
    site_id: 'example-site',
    locus_type: 'project',
    roots: { site_root_windows: 'C:/example/.narada' },
    authority_boundaries: {
      user_site: ['know', 'navigate', 'review', 'route_proposals'],
      example_site: ['target_site_governance'],
      not_granted_by_awareness: ['mutate_target_site_config', 'access_project_secrets'],
    },
    capability_edges: [
      {
        from: 'local-site',
        to: 'example-site',
        capability: 'review',
        status: 'available',
        basis: 'local_registry_awareness',
      },
    ],
    capability_denials: [
      {
        from: 'local-site',
        to: 'example-site',
        capability: 'mutate_target_site_config',
        status: 'not_granted',
        basis: 'local_site_registry_non_grant',
      },
    ],
    sync_posture: 'unknown_until_inspected',
    capabilities: ['known_root'],
    inbox_endpoint: { status: 'not_observed' },
    task_lifecycle: { status: 'not_observed' },
    mcp_access: { status: 'missing_from_current_session' },
    freshness: { reviewed_at: '2026-05-12' },
    health: { status: 'root_known_not_inspected' },
    blockers: [],
    evidence_refs: ['fixture'],
    ...overrides,
  };
}

describe('site config registry awareness descriptors', () => {
  it('validates explicit capability edges and mutation denials without granting target authority', () => {
    const validation = validateKnownSiteRegistryEntry('example-site', knownSite());

    expect(validation.status).toBe('valid');
    expect(validation.config_mutated).toBe(false);
    expect(validation.target_authority_granted).toBe(false);
    expect(validation.warnings).toContain('registered_site_not_inspected');
  });

  it('rejects relationship-as-authority smearing and missing required state fields', () => {
    const validation = validateKnownSiteRegistryEntry('example-site', knownSite({
      site_id: 'other-site',
      task_lifecycle: { status: '' },
      authority_boundaries: {
        user_site: ['know'],
        not_granted_by_awareness: ['access_project_secrets'],
      },
      capability_edges: [
        {
          from: 'local-site',
          to: 'example-site',
          capability: 'mutate',
          status: 'available',
          basis: 'inherited_authority' as 'local_registry_awareness',
        },
      ],
    }));

    expect(validation.status).toBe('invalid');
    expect(validation.errors).toEqual(expect.arrayContaining([
      'registered_site_id_mismatch',
      'registered_site_missing_mutation_denial',
      'registered_site_missing_task_lifecycle_status',
      'registered_site_bad_capability_basis',
    ]));
  });

  it('plans read-only registered Site probes and refuses target mutation state import', () => {
    const planned = decideRegisteredSiteProbe(buildRegisteredSiteProbeRequest({
      site_id: 'example-site',
      authority_basis: { kind: 'local_registry_entry', summary: 'fixture registry entry' },
    }));
    const refused = decideRegisteredSiteProbe(buildRegisteredSiteProbeRequest({
      root: 'C:/external/.narada',
      target_mutation_requested: true,
      arbitrary_scan_requested: true,
      runtime_state_import_requested: true,
      credentials_requested: true,
    }));

    expect(planned.status).toBe('planned_descriptor');
    expect(planned.target_mutated).toBe(false);
    expect(refused.status).toBe('refused');
    expect(refused.refusals).toEqual([
      'site_probe_unregistered_root_requires_operator_authority_basis',
      'target_site_mutation_refused',
      'arbitrary_client_file_scan_refused',
      'runtime_state_import_refused',
      'credential_import_refused',
    ]);
  });

  it('builds read-only probe reports that do not scan arbitrary client files', () => {
    const report = buildRegisteredSiteProbeReport({
      site_id: 'example-site',
      root: 'C:/example/.narada',
      registration_status: 'registered_local_site_registry',
      current_state: knownSite(),
      readable_surfaces: ['config.json', 'AGENTS.md'],
      missing_surfaces: ['.ai/mcp'],
      blockers: ['mcp_missing'],
      recommended_next_actions: ['admit target-rooted MCP before mutation'],
      evidence_refs: ['fixture'],
    });

    expect(report.status).toBe('blocked');
    expect(report.read_only).toBe(true);
    expect(report.target_mutated).toBe(false);
    expect(report.arbitrary_client_files_scanned).toBe(false);
    expect(report.source_state_imported).toBe(false);
  });
});
