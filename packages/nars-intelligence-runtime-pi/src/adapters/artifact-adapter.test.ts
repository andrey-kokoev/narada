import test from 'node:test';
import assert from 'node:assert/strict';
import { createNarsArtifactAdapter, findNarsArtifactCandidates } from './artifact-adapter.js';

test('artifact references remain NARS-owned and arbitrary paths are rejected', async () => {
  const events: any = [];
  const adapter: any = createNarsArtifactAdapter({ eventSink: async (event: any) => events.push(event) });
  const result: any = await adapter.observe({ choices: [{ message: { content: [{ type: 'artifact_ref', artifact_id: 'art_1' }] } }] }, { turn_id: 'turn-1' });
  assert.deepEqual(result.references, [{ artifact_id: 'art_1' }]);
  assert.equal(events[0].kind, 'pi_artifact_reference_observed');
  assert.throws(
    () => findNarsArtifactCandidates({ narada_artifacts: [{ kind: 'text', source_path: 'C:\\secret.txt' }] }),
    /pi_artifact_path_forbidden/,
  );
});

test('explicit artifact candidates use the injected NARS registrar', async () => {
  const calls: any = [];
  const adapter: any = createNarsArtifactAdapter({
    registerArtifact: async (candidate: any) => {
      calls.push(candidate);
      return { public_record: { artifact_id: 'art_registered', kind: candidate.kind } };
    },
  });
  const result: any = await adapter.observe({ narada_artifacts: [{ kind: 'markdown', title: 'Report', content: '# report' }] }, {
    session_id: 'session-1',
    agent_id: 'agent-1',
    turn_id: 'turn-1',
  });
  assert.equal(calls[0].session_id, 'session-1');
  assert.equal(calls[0].content, '# report');
  assert.equal(result.records[0].artifact.artifact_id, 'art_registered');
});

