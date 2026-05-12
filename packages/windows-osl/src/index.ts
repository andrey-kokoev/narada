export interface WindowLabelProjectionDescriptor {
  schema: 'narada.windows_osl.label_projection.v0';
  surface_id: string;
  label_text: string;
  role_text_hex?: string;
  source_labels_imported: false;
}

export interface OslPanelPayloadDescriptor {
  schema: 'narada.windows_osl.panel_payload.v0';
  surface_id: string;
  payload_kind: 'source_modal' | 'status_panel' | 'handoff_panel';
  webview2_required: boolean;
  live_panel_opened: false;
}

export {
  buildOslPanelPayload,
  validateOslPanelPayload,
  type OslPanelActivity,
  type OslPanelAuthority,
  type OslPanelCapabilities,
  type OslPanelExecutionPolicy,
  type OslPanelIdentitySummary,
  type OslPanelPayload,
  type OslPanelPayloadInput,
  type OslPanelPayloadValidationResult,
  type OslPanelPresentation,
  type OslPanelSchema,
  type OslPanelSourceSurface,
} from './panel-payload.js';

export function buildWindowLabelProjectionDescriptor(input: {
  surface_id: string;
  label_text: string;
  role_text_hex?: string;
}): WindowLabelProjectionDescriptor {
  return {
    schema: 'narada.windows_osl.label_projection.v0',
    surface_id: input.surface_id,
    label_text: input.label_text,
    role_text_hex: input.role_text_hex,
    source_labels_imported: false,
  };
}

export function buildOslPanelPayloadDescriptor(surface_id: string): OslPanelPayloadDescriptor {
  return {
    schema: 'narada.windows_osl.panel_payload.v0',
    surface_id,
    payload_kind: 'source_modal',
    webview2_required: true,
    live_panel_opened: false,
  };
}
