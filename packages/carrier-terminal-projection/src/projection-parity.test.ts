import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyNarsClientEventProjection,
  projectNarsClientEvent,
} from '@narada2/nars-client-projection-contract';
import { renderOperatorEvent } from './projected-terminal.js';

test('terminal projection follows shared event classes and renders safe artifact references', () => {
  const artifactEvent = {
    event: 'session_artifact_registered',
    artifact_id: 'artifact-terminal-1',
    artifact_kind: 'html',
    title: 'Terminal artifact',
  };
  const projection = projectNarsClientEvent(artifactEvent);
  assert.equal(classifyNarsClientEventProjection(projection!), 'operations');

  const rendered = renderOperatorEvent(artifactEvent, { timestamps: false, projectionVerbosity: 'operations' });
  const text = rendered.map((line) => typeof line === 'string' ? line : line.raw).join('\n');
  assert.match(text, /Terminal artifact/);
  assert.match(text, /html/);
  assert.doesNotMatch(text, /\[object Object\]/);

  const providerAgent = {
    event_sequence: 40,
    session_id: 'fixture-session',
    event: { type: 'item.completed', item: { id: 'provider-agent-1', type: 'agent_message', text: 'provider telemetry' } },
  };
  assert.deepEqual(renderOperatorEvent(providerAgent, { timestamps: false, projectionVerbosity: 'conversation' }), []);
  assert.equal(renderOperatorEvent(providerAgent, { timestamps: false, projectionVerbosity: 'diagnostics' }).length, 1);
});
