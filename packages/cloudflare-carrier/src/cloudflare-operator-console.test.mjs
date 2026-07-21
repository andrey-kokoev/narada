import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  classifyCloudflareEvidenceCommandState,
  classifyCloudflareOperationCommandState,
  renderCloudflareCarrierConsole,
} from './cloudflare-operator-console.mjs';
import {
  CLOUDFLARE_OPERATOR_CONSOLE_ASSET,
  renderCloudflareOperatorConsoleAsset,
} from './cloudflare-operator-console-asset.mjs';

test('operator console source is independently renderable and contains no server persistence boundary', () => {
  const source = readFileSync(new URL('./cloudflare-operator-console.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /db\.prepare|CLOUDFLARE_SITE_REGISTRY_DB|CLOUDFLARE_CARRIER_TASK_DB|process\.env/u);

  const html = renderCloudflareCarrierConsole();
  assert.match(html, /Narada Cloudflare Carrier/);
  assert.match(html, /naradaCloudflareCarrierClient/);
  assert.match(html, /\/api\/carrier/);
  const script = html.match(/<script type="module">([\s\S]*)<\/script>/)?.[1] ?? '';
  assert.ok(script);
  assert.doesNotThrow(() => new Function(script));
});

test('console asset delivery exposes deterministic metadata and preserves classifier behavior', () => {
  const asset = renderCloudflareOperatorConsoleAsset();
  assert.deepEqual(asset.headers, CLOUDFLARE_OPERATOR_CONSOLE_ASSET);
  assert.equal(asset.headers.content_type, 'text/html; charset=utf-8');
  assert.equal(classifyCloudflareOperationCommandState({ operation_id: 'operation:test', is_active: true }).next_action, 'read_operation_scope');
  assert.equal(classifyCloudflareEvidenceCommandState({ event_kind: 'turn_failed' }).lane, 'failures');
});
