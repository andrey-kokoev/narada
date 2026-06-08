import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  createSiteContinuityBinding,
  createSiteContinuityExchangePacket,
  SITE_CONTINUITY_EMBODIMENT_KINDS,
} from '../../site-continuity/src/site-continuity.mjs';

const SCRIPT_PATH = fileURLToPath(new URL('./cloudflare-site-continuity-sync.mjs', import.meta.url));
const SCRIPT_CWD = fileURLToPath(new URL('..', import.meta.url));

function runSync(args = [], { input = '', env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT_PATH, ...args], {
      cwd: SCRIPT_CWD,
      env: {
        ...process.env,
        CLOUDFLARE_CARRIER_URL: 'http://127.0.0.1:9',
        CLOUDFLARE_CARRIER_TOKEN: 'test-token',
        ...env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

test('site continuity sync help describes supported transports', async () => {
  const result = await runSync(['help']);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /pull-cloudflare/);
  assert.match(result.stdout, /push-cloudflare/);
  assert.match(result.stdout, /read-cloudflare/);
});

test('site continuity sync refuses malformed packets before push', async () => {
  const result = await runSync(['push-cloudflare'], {
    input: JSON.stringify({ packet: { schema: 'wrong' } }),
  });

  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  const body = JSON.parse(result.stderr);
  assert.equal(body.ok, false);
  assert.equal(body.code, 'site_continuity_packet_refused_before_push');
  assert.equal(body.admission.action, 'refuse');
  assert.equal(body.admission.reason, 'site_continuity_exchange_packet_invalid');
  assert.ok(body.admission.validation_errors.includes('site_continuity_exchange_packet_schema_mismatch'));
});

test('site continuity sync refuses executable mutation packets before network', async () => {
  const binding = createSiteContinuityBinding({ site_id: 'site_fixture' });
  const packet = createSiteContinuityExchangePacket({
    binding,
    source_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS,
    target_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER,
    projections: [
      {
        projection_class: 'site_read_model',
        source_cursor: 'local-test-cursor',
      },
    ],
    executable_mutation_requests: [
      {
        mutation_class: 'local_repository_filesystem_mutation',
      },
    ],
  });

  const result = await runSync(['push-cloudflare'], {
    input: JSON.stringify({ packet }),
  });

  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  const body = JSON.parse(result.stderr);
  assert.equal(body.ok, false);
  assert.equal(body.code, 'site_continuity_packet_refused_before_push');
  assert.equal(body.admission.action, 'refuse');
  assert.equal(body.admission.reason, 'site_continuity_exchange_packet_executable_mutation_refused');
  assert.ok(body.admission.evidence_required.includes('authority_route_refusal'));
  assert.ok(body.admission.confirmation_required.includes('mutation_requests_not_imported'));
});
