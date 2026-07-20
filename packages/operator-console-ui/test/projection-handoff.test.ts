import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPendingProjectionDocument,
  PENDING_PROJECTION_BUDGET_MS,
  PENDING_PROJECTION_POLL_INTERVAL_MS,
  scopedAgentSessionsPath,
  sessionRoutePollUrl,
} from '../src/site-agents/projection-handoff.ts';

test('session route poll url carries site, agent, and optional session identity', () => {
  assert.equal(
    sessionRoutePollUrl({ siteId: 'sonar', agentId: 'sonar.resident', sessionId: null }),
    '/console/agents/api/session-route?site_id=sonar&agent_id=sonar.resident',
  );
  assert.equal(
    sessionRoutePollUrl({ siteId: 'sonar', agentId: 'sonar.resident', sessionId: 'session 1' }),
    '/console/agents/api/session-route?site_id=sonar&agent_id=sonar.resident&session_id=session+1',
  );
});

test('scoped sessions path points at the site-agent scoped sessions view', () => {
  assert.equal(scopedAgentSessionsPath('sonar', 'sonar.resident'), '/console/sessions?site=sonar&agent=sonar.resident');
});

test('pending projection document is self-driving and latency-tolerant', () => {
  const document = buildPendingProjectionDocument({ siteId: 'sonar', agentId: 'sonar.resident', sessionId: 'session-1' });
  assert.ok(document.includes('site_id=sonar&amp;') === false, 'poll url stays inside the script block');
  assert.ok(document.includes('site_id=sonar&agent_id=sonar.resident&session_id=session-1'));
  assert.ok(document.includes("payload.status === 'ready'"));
  assert.ok(document.includes('window.location.replace(payload.url)'));
  assert.ok(document.includes("payload.status === 'ambiguous'"));
  assert.ok(document.includes('window.location.replace(payload.sessions_path)'));
  assert.ok(document.includes(String(PENDING_PROJECTION_BUDGET_MS)));
  assert.ok(document.includes(String(PENDING_PROJECTION_POLL_INTERVAL_MS)));
  assert.ok(document.includes('did not become ready within the wait budget'));
  assert.ok(document.includes('Launch accepted. Waiting for the runtime session to register'));
  assert.ok(document.includes('Runtime session registered. Waiting for its Agent Web UI route'));
  assert.ok(document.includes('id="retry"'));
  assert.ok(document.includes('id="cancel"'));
  assert.ok(document.includes("window.addEventListener('pagehide'"));
  assert.ok(document.includes('controller.abort()'));
  assert.ok(!document.includes('deadline = Date.now() + 300000;\n      setTimeout'), 'timeout does not silently extend itself');
  assert.ok(document.includes('href="/console/sessions?site=sonar&amp;agent=sonar.resident"'), 'HTML link escapes its query separator');
  assert.ok(document.includes('/console/sessions?site=sonar&agent=sonar.resident'));
});

test('pending projection document cannot be broken out of its script block', () => {
  const document = buildPendingProjectionDocument({ siteId: 'sonar', agentId: 'x</script><script>alert(1)</script>', sessionId: null });
  assert.ok(!document.includes('x</script>'));
  assert.ok(document.includes('&lt;/script&gt;') || document.includes('x<\\/script>'));
});
