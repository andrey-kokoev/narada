import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatControlPlaneConvergenceLiveText,
  parseControlPlaneConvergenceLiveArgs,
  runControlPlaneConvergenceLive,
} from '../workflows/cloudflare-carrier-control-plane-convergence-live.mjs';

test('control plane convergence parse requires explicit execution acknowledgement', () => {
  assert.throws(
    () => parseControlPlaneConvergenceLiveArgs([
      '--url', 'https://carrier.example',
      '--token', 'token-value',
    ], {}),
    /control_plane_convergence_live_requires_--execute-control-plane/,
  );
});

test('control plane convergence parse accepts operator session auth and max passes', () => {
  const parsed = parseControlPlaneConvergenceLiveArgs([
    '--url', 'https://carrier.example',
    '--operator-session-cookie', 'session-cookie',
    '--execute-control-plane',
    '--max-site-passes', '3',
    '--format', 'text',
  ], {});

  assert.equal(parsed.workerUrl, 'https://carrier.example');
  assert.equal(parsed.maxSitePasses, 3);
  assert.equal(parsed.format, 'text');
  assert.deepEqual(parsed.auth, {
    kind: 'operator_session',
    value: 'session-cookie',
    source: 'operator-session-cookie',
  });
});

test('control plane convergence returns ok immediately when site route already monitors', async () => {
  const invocations = [];
  const result = await runControlPlaneConvergenceLive({
    workerUrl: 'https://carrier.example',
    maxSitePasses: 4,
    auth: { kind: 'bearer', value: 'token-value', source: 'flag:--token' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      return JSON.stringify(mockResponse(args, {
        'site.list': {
          schema: 'narada.cloudflare_carrier.product_read.v1',
          summary: { route_next_action: 'monitor_sites', next_action: 'monitor_sites' },
        },
        posture: {
          schema: 'narada.cloudflare_carrier.posture_coherence_live.v1',
          status: 'ok',
          checked_site_ids: ['site_alpha'],
          issues: [],
        },
        durability: {
          schema: 'narada.cloudflare_carrier.durability_coherence_live.v1',
          status: 'ok',
          checked_site_ids: ['site_alpha'],
          issues: [],
        },
      }));
    },
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.site_pass_count, 0);
  assert.equal(result.final_site_route, 'monitor_sites');
  assert.equal(invocations.length, 3);
});

test('control plane convergence executes focused site pass then proves posture and durability', async () => {
  const invocations = [];
  let siteListReads = 0;
  const result = await runControlPlaneConvergenceLive({
    workerUrl: 'https://carrier.example',
    maxSitePasses: 4,
    auth: { kind: 'operator_session', value: 'session-cookie', source: 'operator-session-cookie' },
    executeAcknowledged: true,
  }, {
    runNodeScript: async (args) => {
      invocations.push(args);
      return JSON.stringify(mockResponse(args, {
        'site.list': () => {
          siteListReads += 1;
          if (siteListReads === 1) {
            return {
              schema: 'narada.cloudflare_carrier.product_read.v1',
              summary: {
                route_next_action: 'focus_next_site',
                route_target: 'site_alpha',
                next_site_id: 'site_alpha',
                next_action: 'refresh_site_continuity_loop',
              },
            };
          }
          return {
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: {
              route_next_action: 'monitor_sites',
              next_action: 'monitor_sites',
            },
          };
        },
        'site.next': {
          schema: 'narada.cloudflare_carrier.site_next_workflow_live.v1',
          status: 'ok',
          delegated_workflow: 'refresh_site_continuity_loop',
          delegated_route_action: 'focus_next_site',
          selected_site_id: 'site_alpha',
        },
        posture: {
          schema: 'narada.cloudflare_carrier.posture_coherence_live.v1',
          status: 'ok',
          checked_site_ids: ['site_alpha', 'site_beta'],
          issues: [],
        },
        durability: {
          schema: 'narada.cloudflare_carrier.durability_coherence_live.v1',
          status: 'ok',
          checked_site_ids: ['site_alpha', 'site_beta'],
          issues: [],
        },
      }));
    },
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.site_pass_count, 1);
  assert.equal(result.initial_site_route, 'focus_next_site');
  assert.equal(result.final_site_route, 'monitor_sites');
  assert.equal(result.site_passes[0].delegated_result.delegated_workflow, 'refresh_site_continuity_loop');
  assert.ok(invocations.some((args) => args[0].split(/[\\/]/).pop() === 'cloudflare-carrier-site-next-workflow-live.mjs'));
  assert.match(formatControlPlaneConvergenceLiveText(result), /Control Plane Convergence: ok/);
});

test('control plane convergence text surfaces direct workflow and read handoffs for each pass', () => {
  const text = formatControlPlaneConvergenceLiveText({
    status: 'ok',
    worker_url: 'https://carrier.example',
    initial_site_route: 'focus_next_site',
    final_site_route: 'monitor_sites',
    site_pass_count: 1,
    posture_coherence: { status: 'ok', issue_count: 0, checked_site_ids: ['site_alpha'] },
    durability_coherence: { status: 'ok', issue_count: 0, checked_site_ids: ['site_alpha'] },
    site_passes: [
      {
        pass: 1,
        site_id: 'site_alpha',
        route_action: 'focus_next_site',
        delegated_result: {
          delegated_workflow: 'focus_next_operation',
          delegated_operation_id: 'operation_alpha',
        },
      },
    ],
  });

  assert.match(text, /Site List: pnpm --filter @narada2\/cloudflare-carrier product:site:list:text -- --url https:\/\/carrier\.example --operator-session-file <operator-session-file>/);
  assert.match(text, /Posture Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:posture:coherence:live:text -- --url https:\/\/carrier\.example --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Durability Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:durability:coherence:live:text -- --url https:\/\/carrier\.example --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text -- --url https:\/\/carrier\.example --site site_alpha --operator-session-file <operator-session-file> --execute-site-next/);
  assert.match(text, /- pass=1 site=site_alpha route=focus_next_site delegated=focus_next_operation/);
  assert.match(text, /  Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text -- --url https:\/\/carrier\.example --site site_alpha --operator-session-file <operator-session-file> --execute-site-next/);
  assert.match(text, /Operation Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:operation:next:workflow:live:text -- --url https:\/\/carrier\.example --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file> --execute-operation-next/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text -- --url https:\/\/carrier\.example --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Operation Review: pnpm --filter @narada2\/cloudflare-carrier product:operation:read:text -- --url https:\/\/carrier\.example --site site_alpha --operation-id operation_alpha --operator-session-file <operator-session-file>/);
});

test('control plane convergence suppresses focused site and operation links without concrete ids', () => {
  const text = formatControlPlaneConvergenceLiveText({
    status: 'ok',
    worker_url: 'https://carrier.example',
    initial_site_route: 'focus_next_site',
    final_site_route: 'monitor_sites',
    site_pass_count: 1,
    posture_coherence: { status: 'ok', issue_count: 0, checked_site_ids: ['site_alpha'] },
    durability_coherence: { status: 'ok', issue_count: 0, checked_site_ids: ['site_alpha'] },
    site_passes: [
      {
        pass: 1,
        site_id: '',
        route_action: 'focus_next_site',
        delegated_result: { delegated_workflow: 'focus_next_operation', delegated_operation_id: '' },
      },
    ],
  });

  assert.doesNotMatch(text, /^Site Next Workflow:/m);
  assert.doesNotMatch(text, /^  Site Next Workflow:/m);
  assert.doesNotMatch(text, /^  Site Read:/m);
  assert.doesNotMatch(text, /^  Operation Next Workflow:/m);
  assert.doesNotMatch(text, /^  Operation Review:/m);
});

test('control plane convergence suppresses worker-scoped links without a real worker url', () => {
  const text = formatControlPlaneConvergenceLiveText({
    status: 'ok',
    initial_site_route: 'focus_next_site',
    final_site_route: 'monitor_sites',
    site_pass_count: 1,
    posture_coherence: { status: 'ok', issue_count: 0, checked_site_ids: ['site_alpha'] },
    durability_coherence: { status: 'ok', issue_count: 0, checked_site_ids: ['site_alpha'] },
    site_passes: [
      {
        pass: 1,
        site_id: 'site_alpha',
        route_action: 'focus_next_site',
        delegated_result: { delegated_workflow: 'focus_next_operation', delegated_operation_id: 'operation_alpha' },
      },
    ],
  });

  assert.doesNotMatch(text, /^Site List:/m);
  assert.doesNotMatch(text, /^Posture Coherence Review:/m);
  assert.doesNotMatch(text, /^Durability Coherence Review:/m);
  assert.doesNotMatch(text, /^Site Next Workflow:/m);
  assert.doesNotMatch(text, /^  Site Next Workflow:/m);
  assert.doesNotMatch(text, /^  Site Read:/m);
  assert.doesNotMatch(text, /^  Operation Next Workflow:/m);
  assert.doesNotMatch(text, /^  Operation Review:/m);
  assert.doesNotMatch(text, /<worker-url>/);
});

test('control plane convergence rejects unsupported site route actions', async () => {
  await assert.rejects(
    async () => {
      await runControlPlaneConvergenceLive({
        workerUrl: 'https://carrier.example',
        maxSitePasses: 2,
        auth: { kind: 'bearer', value: 'token-value', source: 'flag:--token' },
        executeAcknowledged: true,
      }, {
        runNodeScript: async (args) => JSON.stringify(mockResponse(args, {
          'site.list': {
            schema: 'narada.cloudflare_carrier.product_read.v1',
            summary: { route_next_action: 'unsupported_route' },
          },
        })),
      });
    },
    /control_plane_convergence_live_site_route_unsupported:unsupported_route/,
  );
});

function mockResponse(args, responses) {
  const key = classifyArgs(args);
  const value = responses[key];
  assert.ok(value, `missing mock response for ${key}`);
  return typeof value === 'function' ? value() : value;
}

function classifyArgs(args) {
  const scriptName = args[0].split(/[\\/]/).pop();
  if (scriptName === 'cloudflare-carrier-site-next-workflow-live.mjs') return 'site.next';
  if (scriptName === 'cloudflare-carrier-posture-coherence-live.mjs') return 'posture';
  if (scriptName === 'cloudflare-carrier-durability-coherence-live.mjs') return 'durability';
  const operation = valueAfter(args, '--operation');
  if (scriptName === 'cloudflare-carrier-product-read.mjs' && operation === 'site.list') return 'site.list';
  throw new Error(`unexpected_args:${args.join(' ')}`);
}

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  return index === -1 ? null : args[index + 1];
}
