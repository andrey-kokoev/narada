export type OslPanelSchema = 'narada.operator_surface.osl_panel_payload.v0';

export interface OslPanelSourceSurface {
  surface_id: string;
  label: string;
  hwnd?: string;
  projection_source: 'neutral_fixture' | 'receiving_site_projection';
}

export interface OslPanelIdentitySummary {
  identity_id: string;
  site_id: string;
  agent_name: string;
  role_name: string;
  role_label: string;
  agent_kind: 'named_agent' | 'role_compatibility_identity' | 'unknown';
}

export interface OslPanelCapabilities {
  role_capabilities: string[];
  input_capabilities: string[];
  submit_strategy: 'mcp_only' | 'operator_surface_only' | 'not_admitted';
}

export interface OslPanelExecutionPolicy {
  mcp?: string;
  shell?: 'no_standing_native_shell_authority' | 'not_admitted';
  shell_like_actions?: 'denied' | 'not_admitted';
  source: 'receiving_site_supplied' | 'neutral_fixture';
}

export interface OslPanelAuthority {
  site_relation: {
    relation: 'local_projection' | 'external_evidence' | 'unknown';
    source_site?: string;
  };
  authority_limits: string[];
  projection_authority: 'operator_surface_window_labels_projection' | 'neutral_fixture';
  compatibility_projection: true;
  read_only: true;
  read_only_note: string;
}

export interface OslPanelActivity {
  operator_activity?: string;
  task_affinity?: string;
}

export interface OslPanelPresentation {
  title: string;
  preferred_width_px: number;
  preferred_height_px: number;
  dismiss_hints: string[];
}

export interface OslPanelPayload {
  schema: OslPanelSchema;
  generated_at: string;
  source_surface: OslPanelSourceSurface;
  identity: OslPanelIdentitySummary;
  capabilities: OslPanelCapabilities;
  execution_policy: OslPanelExecutionPolicy;
  authority: OslPanelAuthority;
  activity: OslPanelActivity;
  presentation: OslPanelPresentation;
  future_controls: [];
}

export interface OslPanelPayloadInput {
  generated_at?: string;
  source_surface: OslPanelSourceSurface;
  identity: OslPanelIdentitySummary;
  capabilities?: Partial<OslPanelCapabilities>;
  execution_policy?: Partial<OslPanelExecutionPolicy>;
  authority?: Partial<OslPanelAuthority>;
  activity?: OslPanelActivity;
  presentation?: Partial<OslPanelPresentation>;
}

export interface OslPanelPayloadValidationResult {
  ok: boolean;
  refusals: string[];
}

export function buildOslPanelPayload(input: OslPanelPayloadInput): OslPanelPayload {
  return {
    schema: 'narada.operator_surface.osl_panel_payload.v0',
    generated_at: input.generated_at ?? new Date(0).toISOString(),
    source_surface: input.source_surface,
    identity: input.identity,
    capabilities: {
      role_capabilities: input.capabilities?.role_capabilities ?? [],
      input_capabilities: input.capabilities?.input_capabilities ?? [],
      submit_strategy: input.capabilities?.submit_strategy ?? 'not_admitted',
    },
    execution_policy: {
      mcp: input.execution_policy?.mcp,
      shell: input.execution_policy?.shell ?? 'no_standing_native_shell_authority',
      shell_like_actions: input.execution_policy?.shell_like_actions ?? 'denied',
      source: input.execution_policy?.source ?? 'neutral_fixture',
    },
    authority: {
      site_relation: input.authority?.site_relation ?? { relation: 'unknown' },
      authority_limits: input.authority?.authority_limits ?? [
        'panel_payload_is_read_only',
        'no_shell_lifecycle_sqlite_or_binding_mutation_authority',
      ],
      projection_authority: input.authority?.projection_authority ?? 'neutral_fixture',
      compatibility_projection: true,
      read_only: true,
      read_only_note:
        input.authority?.read_only_note ??
        'Panel payload is runtime UI data only; it grants no shell, lifecycle, SQLite, or binding mutation authority.',
    },
    activity: input.activity ?? {},
    presentation: {
      title: input.presentation?.title ?? input.source_surface.label,
      preferred_width_px: input.presentation?.preferred_width_px ?? 520,
      preferred_height_px: input.presentation?.preferred_height_px ?? 420,
      dismiss_hints: input.presentation?.dismiss_hints ?? ['escape', 'focus_loss'],
    },
    future_controls: [],
  };
}

export function validateOslPanelPayload(payload: OslPanelPayload): OslPanelPayloadValidationResult {
  const refusals: string[] = [];

  if (payload.schema !== 'narada.operator_surface.osl_panel_payload.v0') {
    refusals.push('unsupported_panel_payload_schema');
  }
  if (payload.authority.read_only !== true) {
    refusals.push('panel_payload_must_be_read_only');
  }
  if (payload.authority.compatibility_projection !== true) {
    refusals.push('panel_payload_must_be_compatibility_projection');
  }
  if (payload.future_controls.length !== 0) {
    refusals.push('future_controls_require_separate_admission');
  }
  if (payload.execution_policy.shell !== 'no_standing_native_shell_authority') {
    refusals.push('panel_payload_must_not_grant_shell_authority');
  }
  if (payload.execution_policy.shell_like_actions !== 'denied') {
    refusals.push('panel_payload_must_not_grant_shell_like_actions');
  }
  if (payload.source_surface.projection_source === 'receiving_site_projection') {
    const relation = payload.authority.site_relation.relation;
    if (relation !== 'local_projection') {
      refusals.push('receiving_site_projection_requires_local_projection_authority');
    }
  }

  return { ok: refusals.length === 0, refusals };
}
