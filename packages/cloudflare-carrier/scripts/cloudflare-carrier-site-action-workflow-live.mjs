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
const CHILD_STDIO_MAX_BUFFER = 64 * 1024 * 1024;
const productReadScript = resolve(scriptDir, 'cloudflare-carrier-product-read.mjs');
const operationNextWorkflowScript = resolve(scriptDir, 'cloudflare-carrier-operation-next-workflow-live.mjs');
const siteContinuityPublishScript = resolve(scriptDir, 'cloudflare-carrier-site-continuity-publish.mjs');
const continuityBindingsScript = resolve(scriptDir, 'cloudflare-site-continuity-bindings.mjs');
const continuitySchedulerScript = resolve(scriptDir, 'cloudflare-site-continuity-scheduler.mjs');
const siteAuthorityReadScript = resolve(scriptDir, 'cloudflare-carrier-site-authority-read.mjs');
const siteScopeReadScript = resolve(scriptDir, 'cloudflare-carrier-site-scope-read.mjs');

const ACTION_TO_WORKFLOW = {
  monitor_site: { name: 'monitor_site' },
  focus_site_operation: { name: 'focus_site_operation', script: operationNextWorkflowScript },
  focus_next_operation: { name: 'focus_next_operation', script: operationNextWorkflowScript },
  publish_cloudflare_continuity_packet: { name: 'publish_continuity_packet', script: siteContinuityPublishScript },
  bind_cloudflare_product_next_site_locally: { name: 'prepare_next_site_binding', script: continuityBindingsScript },
  refresh_site_continuity_loop: { name: 'refresh_site_continuity_loop', script: continuitySchedulerScript },
  read_site_scope: { name: 'site_scope', script: siteScopeReadScript },
  read_site_authority: { name: 'site_authority', script: siteAuthorityReadScript },
};

export function parseSiteActionWorkflowLiveArgs(argv = [], env = process.env) {
  const args = [...argv];
  const workerUrl = option(args, '--url') ?? env.CLOUDFLARE_CARRIER_URL ?? '';
  const siteId = option(args, '--site') ?? option(args, '--focused-site-id') ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? env.CLOUDFLARE_CARRIER_FOCUSED_SITE_ID ?? null;
  const expectedAction = option(args, '--expected-action') ?? env.CLOUDFLARE_CARRIER_SITE_ACTION_EXPECTED_ACTION ?? null;
  const localSiteRef = option(args, '--local-site-ref') ?? env.CLOUDFLARE_CARRIER_LOCAL_SITE_REF ?? null;
  const cloudflareSiteRef = option(args, '--cloudflare-site-ref') ?? env.CLOUDFLARE_CARRIER_CLOUDFLARE_SITE_REF ?? null;
  const auth = resolveAuth(args, env);
  const executeAcknowledged = flag(args, '--execute-site-action')
    || env.CLOUDFLARE_CARRIER_SITE_ACTION_EXECUTE_LIVE === '1';

  if (!executeAcknowledged) {
    throw new Error('site_action_workflow_live_requires_--execute-site-action_or_CLOUDFLARE_CARRIER_SITE_ACTION_EXECUTE_LIVE=1');
  }
  if (!workerUrl) throw new Error('site_action_workflow_live_requires_--url_or_CLOUDFLARE_CARRIER_URL');
  if (!siteId) throw new Error('site_action_workflow_live_requires_--site_or_--focused-site-id');
  if (!auth) throw new Error('site_action_workflow_live_requires_bearer_token_or_operator_session');

  return {
    workerUrl,
    siteId,
    expectedAction,
    localSiteRef,
    cloudflareSiteRef,
    auth,
    executeAcknowledged,
  };
}

export async function runSiteActionWorkflowLive(
  config,
  { runNodeScript = defaultRunNodeScript } = {},
) {
  const readBefore = parseJsonStdout(
    await runNodeScript(buildSiteReadArgs(config), { cwd: packageRoot }),
    'site_action_read_before',
  );
  assert.equal(readBefore.schema, 'narada.cloudflare_carrier.product_read.v1');

  const action = readBefore.summary.next_action ?? 'monitor_site';
  if (config.expectedAction) {
    assert.equal(
      action,
      config.expectedAction,
      `site_action_workflow_live_expected_action_mismatch:${config.expectedAction}:${action}`,
    );
  }

  const workflow = ACTION_TO_WORKFLOW[action];
  if (!workflow) {
    throw new Error(`site_action_workflow_live_action_unsupported:${action}`);
  }

  if (!workflow.script) {
    return {
      schema: 'narada.cloudflare_carrier.site_action_workflow_live.v1',
      status: 'ok',
      worker_url: config.workerUrl,
      site_id: config.siteId,
      delegated_workflow: workflow.name,
      delegated_action: action,
      read_before_action: readBefore.summary,
      delegated_result: null,
      read_after_action: readBefore.summary,
    };
  }

  const delegatedResult = parseJsonStdout(
    await runNodeScript(buildWorkflowArgs(config, action, workflow.script), { cwd: packageRoot }),
    'site_action_workflow_delegate',
  );

  const readAfter = parseJsonStdout(
    await runNodeScript(buildSiteReadArgs(config), { cwd: packageRoot }),
    'site_action_read_after',
  );
  assert.equal(readAfter.schema, 'narada.cloudflare_carrier.product_read.v1');

  return {
    schema: 'narada.cloudflare_carrier.site_action_workflow_live.v1',
    status: 'ok',
    worker_url: config.workerUrl,
    site_id: config.siteId,
    delegated_workflow: workflow.name,
    delegated_action: action,
    read_before_action: readBefore.summary,
    delegated_result: delegatedResult,
    read_after_action: readAfter.summary,
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

function buildSiteReadArgs(config) {
  const args = [
    productReadScript,
    '--operation', 'site.read',
    '--url', config.workerUrl,
    '--site', config.siteId,
  ];
  appendAuthOptions(args, config);
  return args;
}

function buildWorkflowArgs(config, action, script) {
  if (action === 'focus_next_operation' || action === 'focus_site_operation') {
    const args = [script, '--url', config.workerUrl, '--site', config.siteId, '--execute-operation-next'];
    appendAuthOptions(args, config);
    return args;
  }
  if (action === 'publish_cloudflare_continuity_packet') {
    const args = [script, '--url', config.workerUrl, '--site', config.siteId];
    appendAuthOptions(args, config);
    return args;
  }
  if (action === 'bind_cloudflare_product_next_site_locally') {
    const args = [script, '--action', 'prepare-next-binding-packet', '--url', config.workerUrl, '--site', config.siteId];
    if (config.localSiteRef) args.push('--local-site-ref', config.localSiteRef);
    if (config.cloudflareSiteRef) args.push('--cloudflare-site-ref', config.cloudflareSiteRef);
    appendAuthOptions(args, config);
    return args;
  }
  if (action === 'refresh_site_continuity_loop') {
    const args = [
      script,
      '--action', 'reconcile-execute',
      '--live',
      '--site', config.siteId,
      '--refresh-site-registry-projection',
      '--projection-url', config.workerUrl,
    ];
    appendAuthOptions(args, config);
    return args;
  }
  if (action === 'read_site_scope') {
    const args = [script, '--url', config.workerUrl, '--site', config.siteId];
    appendAuthOptions(args, config);
    return args;
  }
  if (action === 'read_site_authority') {
    const args = [script, '--url', config.workerUrl, '--site', config.siteId];
    appendAuthOptions(args, config);
    return args;
  }
  throw new Error(`site_action_workflow_live_action_unsupported:${action}`);
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
  const config = parseSiteActionWorkflowLiveArgs(process.argv.slice(2));
  const result = await runSiteActionWorkflowLive(config);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
