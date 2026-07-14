import { describe, expect, it } from 'vitest';
import {
  createAgentWebUiAttachmentLifecycle,
  isTerminalAgentWebUiAttachmentState,
  transitionAgentWebUiAttachment,
} from '../../src/commands/agent-web-ui-attachment-state.js';

describe('agent web UI attachment lifecycle', () => {
  it('records discovery, health, projection registration, and attachment', () => {
    let lifecycle = createAgentWebUiAttachmentLifecycle();
    for (const state of ['discovering', 'resolving_endpoints', 'probing_health', 'registering_projection', 'attached'] as const) {
      lifecycle = transitionAgentWebUiAttachment(lifecycle, state);
    }
    expect(lifecycle.state).toBe('attached');
    expect(lifecycle.history).toEqual([
      'requested', 'discovering', 'resolving_endpoints', 'probing_health', 'registering_projection', 'attached',
    ]);
  });

  it('models a bounded session wait and rejects attaching before health probing', () => {
    let lifecycle = createAgentWebUiAttachmentLifecycle();
    lifecycle = transitionAgentWebUiAttachment(lifecycle, 'discovering');
    lifecycle = transitionAgentWebUiAttachment(lifecycle, 'waiting_for_session');
    lifecycle = transitionAgentWebUiAttachment(lifecycle, 'resolving_endpoints');
    expect(() => transitionAgentWebUiAttachment(lifecycle, 'attached')).toThrow(
      'invalid_agent_web_ui_attachment_transition: resolving_endpoints->attached',
    );
    lifecycle = transitionAgentWebUiAttachment(lifecycle, 'probing_health');
    lifecycle = transitionAgentWebUiAttachment(lifecycle, 'refused');
    expect(isTerminalAgentWebUiAttachmentState(lifecycle.state)).toBe(true);
  });
});
