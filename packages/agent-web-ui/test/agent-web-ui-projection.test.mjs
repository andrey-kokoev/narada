import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { appendEvent } from '../src/render.js';
import { refreshHttpHealthStatus } from '../src/health.js';
import { createSessionProjection } from '../src/session-projection.js';
import {
  projectRuntimeEvent,
  reconnectDelayForAttempt,
  resolveAttachConfig,
  shouldRenderRuntimeEvent,
  summarizeRuntimeEvent,
} from '../src/agent-web-ui.js';

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = String(tagName).toUpperCase();
    this.id = null;
    this.children = [];
    this.dataset = {};
    this.textContent = '';
    this.className = '';
    this.value = '';
    this.parentNode = null;
  }

  append(...children) {
    for (const child of children) {
      if (child && typeof child === 'object') child.parentNode = this;
      this.children.push(child);
    }
  }

  replaceChildren(...children) {
    this.children.length = 0;
    this.append(...children);
  }

  remove() {
    const siblings = this.parentNode?.children;
    if (!Array.isArray(siblings)) return;
    const index = siblings.indexOf(this);
    if (index >= 0) siblings.splice(index, 1);
  }
}

function createProjectionDocument({ withNarsConfig = false } = {}) {
  const elements = new Map([
    ['events', new FakeElement('ul')],
    ['projection-verbosity', new FakeElement('select')],
  ]);
  elements.get('projection-verbosity').value = 'conversation';
  if (withNarsConfig) {
    const config = new FakeElement('script');
    config.textContent = JSON.stringify({ artifactBasePath: '/sessions' });
    elements.set('nars-config', config);
  }
  const documentRef = {
    getElementById(id) { return elements.get(id) ?? null; },
    createElement(name) { return new FakeElement(name); },
    createTextNode(text) {
      const node = new FakeElement('#text');
      node.textContent = String(text ?? '');
      return node;
    },
  };
  return { elements, documentRef };
}

test('event stream reconnect uses bounded backoff and visible disconnected duration', () => {
  assert.equal(reconnectDelayForAttempt(1), 1000);
  assert.equal(reconnectDelayForAttempt(2), 2000);
  assert.equal(reconnectDelayForAttempt(5), 10000);
  assert.equal(reconnectDelayForAttempt(20), 10000);
});

test('HTTP health renderer prefers scoped agent identity ref for status text', async () => {
  const { elements, documentRef } = createProjectionDocument();
  elements.set('health', new FakeElement('div'));
  await refreshHttpHealthStatus('http://127.0.0.1:12345/health', documentRef, async () => ({
    status: 200,
    async json() {
      return {
        status: 'healthy',
        agent_id: 'resident',
        agent_identity_ref: {
          schema: 'narada.agent_identity_ref.v1',
          site_id: 'sonar',
          local_agent_id: 'resident',
          canonical_agent_id: 'sonar.resident',
        },
        session_id: 'carrier_test',
      };
    },
  }));
  assert.equal(elements.get('health').textContent, 'healthy · sonar.resident · carrier_test');
});

test('attach config resolves one event endpoint and one health endpoint from query or injected config', () => {
  assert.deepEqual(resolveAttachConfig('?event_endpoint=ws://nars/events&health_endpoint=http://nars/health&max_replay=7'), {
    mode: 'local_nars_projection',
    projectionId: null,
    cloudflareApiBaseUrl: null,
    browserToken: null,
    eventEndpoint: 'ws://nars/events',
    healthEndpoint: 'http://nars/health',
    inputEndpoint: null,
    cacheEndpoint: null,
    healthTransport: 'http-proxy',
    artifactBasePath: '/api/nars',
    artifactTransport: 'local-nars-proxy',
    projectionControl: null,
    authorityTransition: null,
    protocolHealthMethod: 'session.health',
    maxReplay: 7,
  });
  assert.deepEqual(resolveAttachConfig('', { eventEndpoint: 'ws://injected/events', healthEndpoint: '/api/health' }), {
    mode: 'local_nars_projection',
    projectionId: null,
    cloudflareApiBaseUrl: null,
    browserToken: null,
    eventEndpoint: 'ws://injected/events',
    healthEndpoint: '/api/health',
    inputEndpoint: null,
    cacheEndpoint: null,
    healthTransport: 'http-proxy',
    artifactBasePath: '/api/nars',
    artifactTransport: 'local-nars-proxy',
    projectionControl: null,
    authorityTransition: null,
    protocolHealthMethod: 'session.health',
    maxReplay: 100,
  });
});

test('runtime event summaries unwrap NARS session_event envelopes', () => {
  assert.equal(summarizeRuntimeEvent({ event: 'session_events_subscription_started', replay_count: 3 }), '3 replayed event(s)');
  assert.equal(summarizeRuntimeEvent({ event: 'session_event', payload: { event: 'assistant_message', content: 'hello' } }), 'hello');
  assert.equal(summarizeRuntimeEvent({ event: 'session_event', payload: { event: 'tool_call', tool_name: 'narada-site.whoami' } }), 'narada-site.whoami');
});

test('web UI projection renders stale authority reattach target distinctly', () => {
  const projection = projectRuntimeEvent({
    event: 'authority_source_write_refused',
    code: 'authority_source_sealed',
    authority_transition_source: {
      state: 'sealed',
      target_authority_locator: {
        kind: 'cloudflare-host',
        site_id: 'site',
        session_id: 'cf_session',
      },
    },
  });
  assert.equal(projection.kind, 'authority_source_write_refused');
  assert.equal(projection.label, 'Source write refused');
  assert.equal(projection.tone, 'error');
  assert.equal(projection.summary, 'authority_source_sealed; reattach cloudflare-host/site/cf_session');
  assert.equal(shouldRenderRuntimeEvent(projection.event, { verbosity: 'conversation' }), false);
  assert.equal(shouldRenderRuntimeEvent(projection.event, { verbosity: 'operations' }), true);
});

test('web UI projection normalizes nested provider events and suppresses status noise', () => {
  const toolProjection = projectRuntimeEvent({
    event_sequence: 5,
    event: {
      type: 'item.started',
      item: { type: 'mcp_tool_call', server: 'narada-sonar-sop', tool: 'sop_run_start', status: 'in_progress' },
    },
  });
  assert.equal(toolProjection.kind, 'tool_call');
  assert.equal(toolProjection.summary, 'narada-sonar-sop.sop_run_start running');
  const assistantProjection = projectRuntimeEvent({
    event: { type: 'item.completed', item: { type: 'agent_message', text: 'Startup sequence completed.' } },
  });
  assert.equal(assistantProjection.kind, 'provider_agent_message');
  assert.equal(assistantProjection.class, 'diagnostics');
  assert.equal(assistantProjection.summary, 'Startup sequence completed.');
  assert.equal(shouldRenderRuntimeEvent({ event: { type: 'item.completed', item: { type: 'agent_message', text: 'Startup sequence completed.' } } }, { verbosity: 'conversation' }), false);
  assert.equal(shouldRenderRuntimeEvent({ event: { type: 'item.completed', item: { type: 'agent_message', text: 'Startup sequence completed.' } } }, { verbosity: 'diagnostics' }), true);
  assert.equal(shouldRenderRuntimeEvent({ event: 'session_health', status: 'healthy' }), false);
  assert.equal(shouldRenderRuntimeEvent({ event: 'session_health', status: 'healthy' }, { verbosity: 'diagnostics' }), false);
  assert.equal(shouldRenderRuntimeEvent({ event: 'session_health', status: 'healthy' }, { verbosity: 'raw' }), false);
  assert.equal(shouldRenderRuntimeEvent({ event: 'session_health', status: 'degraded' }, { verbosity: 'diagnostics' }), true);
  assert.equal(shouldRenderRuntimeEvent({ event: 'websocket_connected' }, { verbosity: 'raw' }), false);
  assert.equal(shouldRenderRuntimeEvent({ event: 'session_event', payload: { event: 'assistant_message', content: 'ok' } }), true);
});

test('conversation projection shows canonical lifecycle assistant message and hides provider assistant telemetry', () => {
  const events = [
    { event: 'operator_input_submitted', request_id: 'input_startup', content: 'run startup sequence', timestamp: '2026-06-30T18:11:00.000Z' },
    { event: 'user_message', request_id: 'input_startup', content: 'run startup sequence', event_sequence: 1, timestamp: '2026-06-30T18:11:01.000Z' },
    { agent_id: 'resident', session_id: 'carrier_test', event: { type: 'item.completed', item: { id: 'provider_intro', type: 'agent_message', text: 'I’ll run the Narada startup affordance first, as requested, so the session identity and checkpoint context are hydrated before any other work.' } }, timestamp: '2026-06-30T18:11:02.000Z' },
    { agent_id: 'resident', session_id: 'carrier_test', event: { type: 'item.completed', item: { id: 'provider_final', type: 'agent_message', text: 'Startup sequence ran successfully.\n\nIdentity hydrated as resident with high confidence.' } }, timestamp: '2026-06-30T18:11:03.000Z' },
    { event: 'assistant_message', lifecycle_event: 'assistant_message', turn_id: 'turn_startup', request_id: 'input_startup', content: 'I’ll run the Narada startup affordance first, as requested, so the session identity and checkpoint context are hydrated before any other work.\n\nStartup sequence ran successfully.\n\nIdentity hydrated as resident with high confidence.', agent_id: 'resident', session_id: 'carrier_test', event_sequence: 4, timestamp: '2026-06-30T18:11:04.000Z' },
  ];
  const projection = createSessionProjection(events, { verbosity: 'conversation', nowMs: Date.parse('2026-06-30T18:11:05.000Z') });
  const assistantRows = projection.rows.filter((row) => row.kind === 'assistant_message');
  assert.equal(assistantRows.length, 1);
  assert.match(assistantRows[0].summary, /Narada startup affordance/);
  assert.match(assistantRows[0].summary, /Startup sequence ran successfully/);
  assert.equal(projection.rows.some((row) => row.kind === 'provider_agent_message'), false);
  assert.equal(projection.rows.some((row) => row.kind === 'assistant_message_stream'), false);
  assert.equal(projection.activity.active, false);
});

test('conversation projection collapses assistant stream, final, and duplicate final by render identity', () => {
  const events = [
    { event: 'assistant_message_stream', request_id: 'input_startup', turn_id: 'turn_startup', content: 'I’ll run the Narada startup affordance first, as requested, so the session identity and checkpoint context are hydrated before any other work.', event_sequence: 40, sequence: 40, agent_id: 'resident', session_id: 'carrier_test' },
    { event: 'assistant_message', request_id: 'input_startup', turn_id: 'turn_startup', content: 'I’ll run the Narada startup affordance first, as requested, so the session identity and checkpoint context are hydrated before any other work.\n\nStartup sequence ran successfully.\n\nIdentity hydrated as resident with high confidence.', event_sequence: 41, sequence: 41, agent_id: 'resident', session_id: 'carrier_test' },
    { event: 'assistant_message', request_id: 'input_startup', turn_id: 'turn_startup', content: 'I’ll run the Narada startup affordance first, as requested, so the session identity and checkpoint context are hydrated before any other work.\n\nStartup sequence ran successfully.\n\nIdentity hydrated as resident with high confidence.', event_sequence: 42, sequence: 42, agent_id: 'resident', session_id: 'carrier_test' },
  ];
  const projection = createSessionProjection(events, { verbosity: 'conversation' });
  const assistantRows = projection.rows.filter((row) => row.kind === 'assistant_message');
  assert.equal(assistantRows.length, 1);
  assert.equal(assistantRows[0].event.request_id, 'input_startup');
  assert.match(assistantRows[0].summary, /Startup sequence ran successfully/);
  assert.equal(projection.rows.some((row) => row.kind === 'assistant_message_stream'), false);
});

test('conversation projection keeps identical assistant text from distinct turns', () => {
  const events = [
    { event: 'assistant_message', request_id: 'input_first', turn_id: 'turn_first', content: 'Cloudflare runtime tool adapter executed conversation.send.', event_sequence: 20, sequence: 20, agent_id: 'resident', session_id: 'carrier_test' },
    { event: 'assistant_message', request_id: 'input_first', turn_id: 'turn_first', content: 'Cloudflare runtime tool adapter executed conversation.send.', event_sequence: 21, sequence: 21, agent_id: 'resident', session_id: 'carrier_test' },
    { event: 'assistant_message', request_id: 'input_second', turn_id: 'turn_second', content: 'Cloudflare runtime tool adapter executed conversation.send.', event_sequence: 22, sequence: 22, agent_id: 'resident', session_id: 'carrier_test' },
  ];
  const projection = createSessionProjection(events, { verbosity: 'conversation' });
  const assistantRows = projection.rows.filter((row) => row.kind === 'assistant_message');
  assert.equal(assistantRows.length, 2);
  assert.deepEqual(assistantRows.map((row) => row.event.request_id), ['input_first', 'input_second']);
});

test('conversation projection collapses duplicate tool results by render identity', () => {
  const events = [
    { event: 'tool_result', request_id: 'input_diag', tool_name: 'narada-site.whoami', status: 'ok', event_sequence: 50, sequence: 50, agent_id: 'resident', session_id: 'carrier_test' },
    { event: 'tool_result', request_id: 'input_diag', tool_name: 'narada-site.whoami', status: 'ok', event_sequence: 51, sequence: 51, agent_id: 'resident', session_id: 'carrier_test' },
  ];
  const projection = createSessionProjection(events, { verbosity: 'operations' });
  const toolRows = projection.rows.filter((row) => row.kind === 'tool_result');
  assert.equal(toolRows.length, 1);
  assert.equal(toolRows[0].event.request_id, 'input_diag');
  assert.match(toolRows[0].summary, /narada-site\.whoami ok/);
});

test('conversation projection keeps a visible boundary between separate assistant messages in one turn', () => {
  const events = [
    { event: 'assistant_message', request_id: 'input_sop', turn_id: 'turn_sop', content: 'I’ll query the SOP MCP’s template list directly to see what SOPs are registered for this site.', event_sequence: 30, sequence: 30, agent_id: 'resident', session_id: 'carrier_test' },
    { event: 'assistant_message', request_id: 'input_sop', turn_id: 'turn_sop', content: 'No. The SOP MCP template list is empty for this site: `count: 0`.\n\nThere are currently no registered SOP templates, active, draft, or deprecated.', event_sequence: 31, sequence: 31, agent_id: 'resident', session_id: 'carrier_test' },
  ];
  const projection = createSessionProjection(events, { verbosity: 'conversation' });
  const assistantRows = projection.rows.filter((row) => row.kind === 'assistant_message');
  assert.equal(assistantRows.length, 1);
  assert.match(assistantRows[0].summary, /registered for this site\.\n\n---\n\nNo\./);
});

test('conversation projection keeps artifact presentation and lifecycle message while hiding provider notes', () => {
  const events = [
    { event_sequence: 63, sequence: 63, agent_id: 'resident', session_id: 'carrier_test', event: { type: 'item.completed', item: { id: 'item_9', type: 'agent_message', text: 'The artifact is registered. I’m calling artifact_present now so the UI can render it inline.' } } },
    { event_sequence: 67, sequence: 67, event: 'assistant_message', source: 'nars_artifact_presentation', agent_id: 'resident', session_id: 'carrier_test', request_id: 'artifact_present_art_1', content: [{ type: 'text', text: 'Here is the registered HTML artifact rendered inline.' }, { type: 'artifact_ref', artifact_id: 'art_1', kind: 'html', title: 'Preview', render_hint: 'inline' }] },
    { event_sequence: 69, sequence: 69, agent_id: 'resident', session_id: 'carrier_test', event: { type: 'item.completed', item: { id: 'item_11', type: 'agent_message', text: 'Done. Created and presented the artifact.' } } },
    { event_sequence: 74, sequence: 74, event: 'assistant_message', lifecycle_event: 'assistant_message', turn_id: 'turn_1', agent_id: 'resident', session_id: 'carrier_test', content: 'The artifact is registered. I’m calling artifact_present now so the UI can render it inline.\n\nDone. Created and presented the artifact.' },
  ];
  const projection = createSessionProjection(events, { verbosity: 'conversation' });
  const assistantRows = projection.rows.filter((row) => row.kind === 'assistant_message');
  assert.equal(assistantRows.length, 2);
  assert.equal(Array.isArray(assistantRows[0].summary), true);
  assert.match(assistantRows[1].summary, /inline\.\n\nDone\./);
  assert.equal(projection.rows.some((row) => row.kind === 'provider_agent_message'), false);
});

test('conversation projection renders registered artifacts without switching to operations', () => {
  const events = [
    { event_sequence: 67, sequence: 67, event: 'session_artifact_registered', agent_id: 'resident', session_id: 'carrier_test', artifact: { artifact_id: 'art_1', kind: 'html', title: 'Preview', render_hint: 'inline' } },
    { event_sequence: 68, sequence: 68, event: 'tool_result', tool_name: 'fixture.tool', status: 'ok', agent_id: 'resident', session_id: 'carrier_test' },
  ];
  const projection = createSessionProjection(events, { verbosity: 'conversation' });
  assert.deepEqual(projection.rows.map((row) => row.kind), ['session_artifact_registered']);
  assert.equal(projection.rows[0].disposition, 'conversation_fact');
  assert.deepEqual(projection.rows[0].summary, [{ type: 'text', text: 'Preview' }, { type: 'artifact_ref', artifact_id: 'art_1', kind: 'html', title: 'Preview', render_hint: 'inline' }]);
});

test('conversation projection preserves audio artifact references for browser playback', () => {
  const events = [
    { event_sequence: 77, sequence: 77, event: 'assistant_message', source: 'nars_artifact_presentation', agent_id: 'resident', session_id: 'carrier_test', request_id: 'artifact_present_audio_1', content: [{ type: 'text', text: 'Spoken version is ready.' }, { type: 'artifact_ref', artifact_id: 'art_audio_1', kind: 'audio', title: 'Spoken briefing', render_hint: 'inline' }] },
  ];
  const projection = createSessionProjection(events, { verbosity: 'conversation' });
  assert.deepEqual(projection.rows.map((row) => row.kind), ['assistant_message']);
  assert.deepEqual(projection.rows[0].summary, [{ type: 'text', text: 'Spoken version is ready.' }, { type: 'artifact_ref', artifact_id: 'art_audio_1', kind: 'audio', title: 'Spoken briefing', render_hint: 'inline' }]);
});

test('Vue artifact renderer exposes explicit audio controls for audio artifacts', () => {
  const component = readFileSync(new URL('../src/app/components/content/ArtifactReferencePart.vue', import.meta.url), 'utf8');
  assert.match(component, /<audio[\s\S]*controls[\s\S]*preload="metadata"[\s\S]*:src="contentUrl \?\? undefined"/);
  assert.match(component, /canPreviewAudio/);
});

test('DOM renderer projects audio artifact references as explicit audio controls', () => {
  const { elements, documentRef } = createProjectionDocument({ withNarsConfig: true });
  appendEvent({ event_sequence: 78, sequence: 78, event: 'assistant_message', source: 'nars_artifact_presentation', agent_id: 'resident', session_id: 'carrier_test', request_id: 'artifact_present_audio_1', content: [{ type: 'text', text: 'Spoken version is ready.' }, { type: 'artifact_ref', artifact_id: 'art_audio_1', kind: 'audio', title: 'Spoken briefing', render_hint: 'inline' }] }, documentRef, { verbosity: 'conversation' });
  const row = elements.get('events').children.find((child) => child?.dataset?.eventKind === 'assistant_message');
  const card = row.children[1].children[0].children.find((child) => child?.className === 'artifact-card');
  const audio = card.children.find((child) => child?.tagName === 'AUDIO');
  assert.equal(audio.className, 'artifact-audio-preview');
  assert.equal(audio.controls, true);
  assert.equal(audio.preload, 'metadata');
  assert.equal(audio.src, '/sessions/sessions/carrier_test/artifacts/art_audio_1/content');
});

test('conversation projection preserves canonical lifecycle content without punctuation boundary guessing', () => {
  const events = [
    { event_sequence: 74, sequence: 74, event: 'assistant_message', lifecycle_event: 'assistant_message', turn_id: 'turn_1', request_id: 'input_1', agent_id: 'resident', session_id: 'carrier_test', content: 'The artifact is registered. I’m calling artifact_present now so the UI can render it inline.Done. Created and presented the artifact.' },
  ];
  const projection = createSessionProjection(events, { verbosity: 'conversation' });
  const assistantRows = projection.rows.filter((row) => row.kind === 'assistant_message');
  assert.equal(assistantRows.length, 1);
  assert.equal(assistantRows[0].summary, 'The artifact is registered. I’m calling artifact_present now so the UI can render it inline.Done. Created and presented the artifact.');
});

test('DOM renderer keeps artifact presentation and lifecycle message while hiding provider notes', () => {
  const { elements, documentRef } = createProjectionDocument({ withNarsConfig: true });
  const events = [
    { event_sequence: 63, sequence: 63, agent_id: 'resident', session_id: 'carrier_test', event: { type: 'item.completed', item: { id: 'item_9', type: 'agent_message', text: 'The artifact is registered. I’m calling artifact_present now so the UI can render it inline.' } } },
    { event_sequence: 67, sequence: 67, event: 'assistant_message', source: 'nars_artifact_presentation', agent_id: 'resident', session_id: 'carrier_test', request_id: 'artifact_present_art_1', content: [{ type: 'text', text: 'Here is the registered HTML artifact rendered inline.' }, { type: 'artifact_ref', artifact_id: 'art_1', kind: 'html', title: 'Preview', render_hint: 'inline' }] },
    { event_sequence: 69, sequence: 69, agent_id: 'resident', session_id: 'carrier_test', event: { type: 'item.completed', item: { id: 'item_11', type: 'agent_message', text: 'Done. Created and presented the artifact.' } } },
    { event_sequence: 74, sequence: 74, event: 'assistant_message', lifecycle_event: 'assistant_message', turn_id: 'turn_1', agent_id: 'resident', session_id: 'carrier_test', content: 'The artifact is registered. I’m calling artifact_present now so the UI can render it inline.\n\nDone. Created and presented the artifact.' },
  ];
  for (const event of events) appendEvent(event, documentRef, { verbosity: 'conversation' });
  const rows = elements.get('events').children.filter((child) => child?.dataset?.eventKind === 'assistant_message');
  assert.equal(rows.length, 2);
  assert.match(rows[0].dataset.assistantSummary, /registered HTML artifact/);
  assert.match(rows[1].dataset.assistantSummary, /Done/);
  assert.equal(elements.get('events').children.some((child) => child?.dataset?.eventKind === 'provider_agent_message'), false);
});

test('replayed user message does not duplicate operator row or reopen queued activity after assistant completion', () => {
  const events = [
    { event: 'operator_input_submitted', request_id: 'local_echo_startup', content: 'run startup sequence', event_sequence: 10, sequence: 10, timestamp: '2026-06-30T18:11:00.000Z' },
    { event: 'assistant_message', request_id: 'input_startup', content: 'done', event_sequence: 11, sequence: 11, timestamp: '2026-06-30T18:11:01.000Z' },
    { event: 'user_message', request_id: 'input_startup', content: 'run startup sequence', event_sequence: 12, sequence: 12, timestamp: '2026-06-30T18:11:02.000Z' },
  ];
  const projection = createSessionProjection(events, { verbosity: 'conversation', nowMs: Date.parse('2026-06-30T18:11:03.000Z') });
  const operatorRows = projection.rows.filter((row) => row.kind === 'operator_input_submitted' || row.kind === 'user_message');
  assert.equal(operatorRows.length, 1);
  assert.equal(operatorRows[0].kind, 'user_message');
  assert.equal(operatorRows[0].summary, 'run startup sequence');
  assert.equal(projection.activity.active, false);
});

test('DOM renderer replaces local operator submit echo with canonical user message', () => {
  const { elements, documentRef } = createProjectionDocument();
  appendEvent({ event: 'operator_input_submitted', request_id: 'local_echo', content: 'run startup sequence' }, documentRef, { verbosity: 'conversation' });
  appendEvent({ event: 'user_message', request_id: 'nars_input', session_id: 'carrier_test', content: 'run startup sequence' }, documentRef, { verbosity: 'conversation' });
  const rows = elements.get('events').children.filter((child) => child?.dataset?.eventKind === 'operator_input_submitted' || child?.dataset?.eventKind === 'user_message');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].dataset.eventKind, 'user_message');
});

test('session projection reduces routine health into state and clears completed tool activity', () => {
  const agentIdentityRef = {
    schema: 'narada.agent_identity_ref.v1',
    site_id: 'sonar',
    local_agent_id: 'resident',
    canonical_agent_id: 'sonar.resident',
  };
  const events = [
    { event: 'session_health', status: 'healthy', agent_id: 'resident', agent_identity_ref: agentIdentityRef, session_id: 'carrier_test', timestamp: '2026-06-30T15:00:00.000Z' },
    { event: 'session_health', status: 'healthy', agent_id: 'resident', agent_identity_ref: agentIdentityRef, session_id: 'carrier_test', timestamp: '2026-06-30T15:00:10.000Z' },
    { event_sequence: 10, sequence: 10, agent_id: 'resident', agent_identity_ref: agentIdentityRef, session_id: 'carrier_test', timestamp: '2026-06-30T15:00:11.000Z', event: { type: 'item.started', item: { id: 'tool_1', type: 'mcp_tool_call', server: 'narada-sonar-agent-context', tool: 'agent_context_startup_sequence' } } },
    { event_sequence: 11, sequence: 11, agent_id: 'resident', agent_identity_ref: agentIdentityRef, session_id: 'carrier_test', timestamp: '2026-06-30T15:00:12.000Z', event: { type: 'item.completed', item: { id: 'tool_1', type: 'mcp_tool_call', server: 'narada-sonar-agent-context', tool: 'agent_context_startup_sequence', result: { content: [{ type: 'text', text: '{"status":"ok"}' }] } } } },
    { event: 'session_health', status: 'healthy', agent_id: 'resident', agent_identity_ref: agentIdentityRef, session_id: 'carrier_test', timestamp: '2026-06-30T15:04:00.000Z' },
  ];
  const projection = createSessionProjection(events, { verbosity: 'diagnostics', nowMs: Date.parse('2026-06-30T15:04:36.000Z') });
  assert.equal(projection.health.status, 'healthy');
  assert.equal(projection.health.agentId, 'sonar.resident');
  assert.equal(projection.health.text, 'healthy · sonar.resident · carrier_test');
  assert.equal(projection.health.healthySampleCount, 3);
  assert.equal(projection.rows.some((row) => row.kind === 'session_health'), false);
  assert.equal(projection.rows.some((row) => row.kind === 'websocket_connected'), false);
  assert.equal(projection.rows.some((row) => row.kind === 'tool_result'), false);
  assert.equal(projection.activity.active, true);
  assert.equal(projection.activity.state, 'thinking');
  assert.equal(projection.activity.label, 'sonar.resident is thinking...');
  assert.notEqual(projection.activity.state, 'tool');

  const completeProjection = createSessionProjection([...events, { event: 'turn_complete', turn_id: 'turn_after_tool', terminal_state: 'completed', timestamp: '2026-06-30T15:04:37.000Z' }], { verbosity: 'diagnostics' });
  assert.equal(completeProjection.activity.active, false);
});

test('session projection clears stale activity when health reports no running turn', () => {
  const events = [
    { event: 'turn_started', turn_id: 'turn_stale', agent_id: 'resident', session_id: 'carrier_test', provider: 'codex-subscription', timestamp: '2026-06-30T15:00:00.000Z' },
    { event: 'assistant_message_stream', turn_id: 'turn_stale', agent_id: 'resident', session_id: 'carrier_test', content: 'partial', timestamp: '2026-06-30T15:00:03.000Z' },
    { event: 'session_health', status: 'healthy', active_turn_state: 'idle', active_turn_id: null, agent_id: 'resident', session_id: 'carrier_test', timestamp: '2026-06-30T15:10:00.000Z' },
  ];
  const projection = createSessionProjection(events, { verbosity: 'conversation', nowMs: Date.parse('2026-06-30T15:10:01.000Z') });
  assert.equal(projection.activity.active, false);
  assert.equal(projection.activity.state, 'idle');
});

test('session projection clears activity on turn interruption', () => {
  const events = [
    { event: 'turn_started', turn_id: 'turn_interrupt', agent_id: 'resident', session_id: 'carrier_test', provider: 'codex-subscription', timestamp: '2026-06-30T15:00:00.000Z' },
    { event: 'turn_interrupted', turn_id: 'turn_interrupt', agent_id: 'resident', session_id: 'carrier_test', timestamp: '2026-06-30T15:00:05.000Z' },
  ];
  const projection = createSessionProjection(events, { verbosity: 'conversation', nowMs: Date.parse('2026-06-30T15:00:06.000Z') });
  assert.equal(projection.activity.active, false);
  assert.equal(projection.activity.state, 'idle');
});

test('diagnostics projection shows fault signals without routine transcript and operation rows', () => {
  const base = { agent_id: 'resident', session_id: 'carrier_diag', timestamp: '2026-06-30T18:00:00.000Z', provider: 'codex-subscription' };
  const events = [
    { ...base, event: 'operator_input_submitted', request_id: 'input_diag', content: 'run startup sequence' },
    { ...base, event: 'tool_call', request_id: 'input_diag', tool_name: 'narada-sonar-agent-context.agent_context_startup_sequence' },
    { ...base, event: 'tool_result', request_id: 'input_diag', tool_name: 'narada-sonar-agent-context.agent_context_startup_sequence', status: 'ok' },
    { ...base, event: 'tool_result', request_id: 'input_diag', tool_name: 'narada-sonar-sop.sop_run_start', status: 'failed', error: 'sop unavailable' },
    { ...base, event: 'assistant_message', request_id: 'input_diag', content: 'Startup sequence completed.' },
    { ...base, event: 'session_health', status: 'degraded', mcp_operational_state: 'degraded', mcp_runtime_fault_count: 1 },
    { ...base, event: 'websocket_error', message: 'socket dropped' },
    { ...base, event: 'turn_failed', terminal_state: 'failed', message: 'provider failed' },
  ];
  const projection = createSessionProjection(events, { verbosity: 'diagnostics', nowMs: Date.parse('2026-06-30T18:00:05.000Z') });
  assert.deepEqual(projection.rows.map((row) => row.kind), ['session_health', 'websocket_error', 'turn_failed']);
  assert.match(projection.rows.map((row) => row.summary).join('\n'), /degraded|socket dropped|provider failed|turn_failed/i);
});

