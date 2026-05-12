import { describe, expect, it } from 'vitest';
import { buildOslPanelPayload, validateOslPanelPayload, type OslPanelPayload } from '../src/index.js';

function neutralPayload(overrides: Partial<OslPanelPayload> = {}): OslPanelPayload {
  const payload = buildOslPanelPayload({
    generated_at: '2026-05-11T00:00:00.000Z',
    source_surface: {
      surface_id: 'surface.fixture',
      label: 'Architect',
      projection_source: 'neutral_fixture',
    },
    identity: {
      identity_id: 'identity.fixture.architect',
      site_id: 'site.fixture',
      agent_name: 'Architect',
      role_name: 'architect',
      role_label: 'Architect',
      agent_kind: 'named_agent',
    },
    capabilities: {
      role_capabilities: ['observe_operator_surface'],
      input_capabilities: ['mcp_descriptor_read'],
      submit_strategy: 'mcp_only',
    },
    execution_policy: {
      source: 'neutral_fixture',
    },
    authority: {
      site_relation: { relation: 'unknown' },
      projection_authority: 'neutral_fixture',
    },
  });

  return { ...payload, ...overrides };
}

describe('OSL WebView2 panel payload contract', () => {
  it('builds a read-only compatibility projection with no future controls', () => {
    const payload = neutralPayload();
    const validation = validateOslPanelPayload(payload);

    expect(payload.schema).toBe('narada.operator_surface.osl_panel_payload.v0');
    expect(payload.authority.read_only).toBe(true);
    expect(payload.authority.compatibility_projection).toBe(true);
    expect(payload.future_controls).toEqual([]);
    expect(payload.execution_policy.shell).toBe('no_standing_native_shell_authority');
    expect(payload.execution_policy.shell_like_actions).toBe('denied');
    expect(validation).toEqual({ ok: true, refusals: [] });
  });

  it('refuses visible controls and shell-like authority in panel payloads', () => {
    const payload = neutralPayload({
      future_controls: [{ label: 'Run' }] as unknown as [],
      execution_policy: {
        source: 'neutral_fixture',
        shell: 'not_admitted',
        shell_like_actions: 'not_admitted',
      },
    });

    expect(validateOslPanelPayload(payload)).toEqual({
      ok: false,
      refusals: [
        'future_controls_require_separate_admission',
        'panel_payload_must_not_grant_shell_authority',
        'panel_payload_must_not_grant_shell_like_actions',
      ],
    });
  });

  it('requires local projection authority for receiving-Site runtime projections', () => {
    const payload = neutralPayload({
      source_surface: {
        surface_id: 'surface.local',
        label: 'Local',
        projection_source: 'receiving_site_projection',
      },
      authority: {
        site_relation: { relation: 'external_evidence', source_site: 'narada-andrey' },
        authority_limits: ['external_evidence_only'],
        projection_authority: 'operator_surface_window_labels_projection',
        compatibility_projection: true,
        read_only: true,
        read_only_note: 'External evidence cannot become local payload truth.',
      },
    });

    expect(validateOslPanelPayload(payload)).toEqual({
      ok: false,
      refusals: ['receiving_site_projection_requires_local_projection_authority'],
    });
  });
});
