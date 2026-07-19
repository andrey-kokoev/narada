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
  assert.ok(document.includes('taking longer than expected'));
  assert.ok(document.includes('/console/sessions?site=sonar&amp;agent=sonar.resident') === false, 'script keeps the raw scoped path');
  assert.ok(document.includes('/console/sessions?site=sonar&agent=sonar.resident'));
});

test('pending projection document cannot be broken out of its script block', () => {
  const document = buildPendingProjectionDocument({ siteId: 'sonar', agentId: 'x</script><script>alert(1)</script>', sessionId: null });
  assert.ok(!document.includes('x</script>'));
  assert.ok(document.includes('&lt;/script&gt;') || document.includes('x<\\/script>'));
});
