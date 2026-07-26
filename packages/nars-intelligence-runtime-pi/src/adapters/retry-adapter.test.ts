import test from 'node:test';
import assert from 'node:assert/strict';
import { runProviderWithBoundedRetry } from './retry-adapter.js';

test('retry stays inside one kernel turn for acknowledged retryable provider failures', async () => {
  let attempts: any = 0;
  const telemetry: any = [];
  const result: any = await runProviderWithBoundedRetry(async () => {
    attempts += 1;
    return attempts === 1
      ? { admission: 'acknowledged', error: { code: 'rate_limited', retryable: true } }
      : { admission: 'acknowledged', response: { content: 'recovered' } };
  }, { maxAttempts: 3, eventSink: (event: any) => telemetry.push(event) });
  assert.equal(attempts, 2);
  assert.equal(result.attempts, 2);
  assert.equal(result.outcome.response.content, 'recovered');
  assert.equal(telemetry[0].kind, 'pi_retry_telemetry');
  assert.equal(telemetry[0].next_attempt, 2);
});

test('uncertain provider outcomes are not automatically resent', async () => {
  let attempts: any = 0;
  const result: any = await runProviderWithBoundedRetry(async () => {
    attempts += 1;
    return { admission: 'uncertain', error: { code: 'transport_ambiguous', retryable: true } };
  }, { maxAttempts: 4 });
  assert.equal(attempts, 1);
  assert.equal(result.attempts, 1);
  assert.equal(result.outcome.error.code, 'transport_ambiguous');
});
