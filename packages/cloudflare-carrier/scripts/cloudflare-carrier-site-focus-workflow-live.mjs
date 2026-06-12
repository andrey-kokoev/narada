#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { resolveAuth } from './cloudflare-carrier-product-read.mjs';

const execFile = promisify(execFileCallback);
const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const packageRoot = resolve(scriptDir, '..');
const productReadScript = resolve(scriptDir, 'cloudflare-carrier-product-read.mjs');
const CHILD_STDIO_MAX_BUFFER = 64 * 1024 * 1024;

export function parseSiteFocusWorkflowLiveArgs(argv = [], env = process.env) {
  const args = [...argv];
  const workerUrl = option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '';
  const expectedSiteId = option(args, '--focused-site-id') ?? option(args, '--site-id') ?? env.CLOUDFLARE_CARRIER_FOCUSED_SITE_ID ?? null;
  const expectedRouteAction = option(args, '--expected-route-action') ?? env.CLOUDFLARE_CARRIER_SITE_FOCUS_EXPECTED_ROUTE_ACTION ?? 'focus_next_site';
  const auth = resolveAuth(args, env);
  const executeAcknowledged = flag(args, '--execute-site-focus')
    || env.CLOUDFLARE_CARRIER_SITE_FOCUS_EXECUTE_LIVE === '1';

  if (!executeAcknowledged) {
    throw new Error('site_focus_workflow_live_requires_--execute-site-focus_or_CLOUDFLARE_CARRIER_SITE_FOCUS_EXECUTE_LIVE=1');
  }
  if (!workerUrl) throw new Error('site_focus_workflow_live_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!auth) throw new Error('site_focus_workflow_live_requires_bearer_token_or_operator_session');

  return {
    workerUrl,
    expectedSiteId,
    expectedRouteAction,
    auth,
    executeAcknowledged,
  };
}

export async function runSiteFocusWorkflowLive(
  config,
  { runNodeScript = defaultRunNodeScript } = {},
) {
  const listBefore = parseJsonStdout(
    await runNodeScript(buildSiteListArgs(config), { cwd: packageRoot }),
    'site_list_before_focus',
  );
  assert.equal(listBefore.schema, 'narada.cloudflare_carrier.product_read.v1');

  const selectedSiteId = listBefore.summary.next_site_id ?? listBefore.summary.route_target ?? null;
  assert.ok(selectedSiteId, 'site_focus_workflow_live_requires_next_site');
  if (config.expectedSiteId) {
    assert.equal(
      selectedSiteId,
      config.expectedSiteId,
      `site_focus_workflow_live_expected_site_mismatch:${config.expectedSiteId}:${selectedSiteId}`,
    );
  }
  assert.equal(
    listBefore.summary.route_next_action,
    config.expectedRouteAction,
    `site_focus_workflow_live_expected_route_action_mismatch:${config.expectedRouteAction}:${listBefore.summary.route_next_action ?? 'null'}`,
  );

  const readFocused = parseJsonStdout(
    await runNodeScript(buildSiteReadArgs(config, selectedSiteId), { cwd: packageRoot }),
    'site_read_focused',
  );
  assert.equal(readFocused.schema, 'narada.cloudflare_carrier.product_read.v1');
  assert.equal(readFocused.summary.site_id, selectedSiteId);

  return {
    schema: 'narada.cloudflare_carrier.site_focus_workflow_live.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    selected_site_id: selectedSiteId,
    expected_site_id: config.expectedSiteId,
    expected_route_action: config.expectedRouteAction,
    list_before_focus: listBefore.summary,
    read_focused: readFocused.summary,
  };
}

async function defaultRunNodeScript(args, options) {
  const result = await execFile(process.execPath, args, {
    ...options,
    timeout: 120000,
    maxBuffer: CHILD_STDIO_MAX_BUFFER,
    windowsHide: true,
  });
  return result.stdout;
}

function buildSiteListArgs(config) {
  const args = [
    productReadScript,
    '--operation', 'site.list',
    '--url', config.workerUrl,
  ];
  appendAuthOptions(args, config);
  return args;
}

function buildSiteReadArgs(config, siteId) {
  const args = [
    productReadScript,
    '--operation', 'site.read',
    '--url', config.workerUrl,
    '--site', siteId,
  ];
  appendAuthOptions(args, config);
  return args;
}

function appendAuthOptions(args, config) {
  if (config.auth?.kind === 'bearer') {
    args.push('--token', config.auth.value);
    return;
  }
  if (config.auth?.kind === 'operator_session') {
    args.push('--operator-session-cookie', config.auth.value);
  }
}

function parseJsonStdout(stdout, label) {
  const text = String(stdout ?? '').trim();
  if (!text) throw new Error(`${label}_stdout_empty`);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label}_stdout_invalid_json:${error.message}`);
  }
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function flag(args, name) {
  return args.includes(name);
}

if (resolve(process.argv[1] ?? '') === scriptPath) {
  const config = parseSiteFocusWorkflowLiveArgs(process.argv.slice(2));
  const result = await runSiteFocusWorkflowLive(config);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
