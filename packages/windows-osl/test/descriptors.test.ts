import { describe, expect, it } from 'vitest';
import { buildOslPanelPayloadDescriptor, buildWindowLabelProjectionDescriptor } from '../src/index.js';

describe('windows OSL descriptors', () => {
  it('keeps label and panel contracts detached from live runtime state', () => {
    const label = buildWindowLabelProjectionDescriptor({
      surface_id: 'surface.fixture',
      label_text: 'Architect',
      role_text_hex: 'E879F9',
    });
    const panel = buildOslPanelPayloadDescriptor(label.surface_id);

    expect(label.source_labels_imported).toBe(false);
    expect(panel.webview2_required).toBe(true);
    expect(panel.live_panel_opened).toBe(false);
  });
});
