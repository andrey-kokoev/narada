#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}

function printHelp() {
  process.stdout.write(`Cloudflare provider-capable NARS authority live smoke\n\n`);
  process.stdout.write(`Safe planning mode (no mutation):\n  pnpm --filter @narada2/cloudflare-nars-projection smoke:provider-capable-live\n\n`);
  process.stdout.write(`Live deployed smoke (requires operator authorization and provider-backed Worker env):\n  ${liveCommand('https://narada-nars-projection.andrei-kokoev.workers.dev')}\n\n`);
  process.stdout.write(`Prerequisites for a live run:\n`);
  process.stdout.write(`  - The deployed Worker must carry NARADA_AI_BASE_URL and NARADA_AI_API_KEY (secret) bindings.\n`);
  process.stdout.write(`  - Deploy dry-run first: pnpm --filter @narada2/cloudflare-nars-projection deploy:dry-run\n`);
  process.stdout.write(`  - Record the operator authorization for the live run in the task file before executing.\n\n`);
  process.stdout.write(`Options:\n`);
  process.stdout.write(`  --live                         Mutate deployed Cloudflare authority state and call the real provider.\n`);
  process.stdout.write(`  --cloudflare-api-base-url URL  Deployed Worker base URL. Required with --live.\n`);
  process.stdout.write(`  --format json                  Emit JSON on stdout instead of human output.\n`);
  process.stdout.write(`  --evidence-path PATH           Override evidence output path.\n`);
  process.stdout.write(`  --session-id ID                Override synthetic session id.\n`);
  process.stdout.write(`  --quiet                        Suppress phase output in human mode.\n`);
}

const result = await run();
printResult(result);
process.exitCode = result.status === 'passed' || result.status === 'planned' ? 0 : 1;

async function run() {
  const evidencePaths = resolveEvidencePaths('provider-capable-live-smoke', args);
  const suggestedCommand = liveCommand(args.cloudflareApiBaseUrl ?? '<cloudflare-worker-url>');
  if (!args.live) {
    return evidence({
      schema: 'narada.cloudflare_nars_authority.live_smoke.v1',
      status: 'planned',
      code: 'live_flag_required',
      smoke_lineage: 'provider-capable-live',
      operator_action: 'Re-run with --live after recording explicit operator authorization for deployed provider-backed mutation and live provider calls.',
      required: requiredArgs(),
      suggested_command: suggestedCommand,
      evidence_path: null,
    }, evidencePaths, false);
  }
  const missing = requiredArgs().filter((name) => !args[optionKey(name)]);
  if (missing.length) {
    return evidence({
      schema: 'narada.cloudflare_nars_authority.live_smoke.v1',
      status: 'refused',
      code: 'missing_required_live_smoke_options',
      smoke_lineage: 'provider-capable-live',
      missing,
      suggested_command: suggestedCommand,
      evidence_path: evidencePaths.evidencePath,
    }, evidencePaths, true);
  }

  const baseUrl = args.cloudflareApiBaseUrl.replace(/\/+$/, '');
  const sessionId = args.sessionId ?? `cf_provider_live_${Date.now()}`;
  const siteId = args.siteId ?? 'narada.cloudflare.live';
  const agentId = args.agentId ?? 'cloudflare.resident';
  const sessionBase = `${baseUrl}/api/nars/authority/sessions/${encodeURIComponent(sessionId)}`;
  const message = args.message ?? `Cloudflare provider-capable live smoke ${Date.now()}`;
  let created = null;
  let revoke = null;
  let cleanup = { status: 'not_needed' };

  try {
    phase(`checking service health at ${baseUrl}`);
    const serviceHealth = await getJson(`${baseUrl}/api/nars/authority/health`);
    if (serviceHealth.execution !== 'cloudflare_provider_http_adapter') {
      return evidence({
        schema: 'narada.cloudflare_nars_authority.live_smoke.v1',
        status: 'failed',
        code: 'provider_adapter_not_bound',
        smoke_lineage: 'provider-capable-live',
        detail: `Deployed Worker reports execution ${serviceHealth.execution ?? 'unknown'}; provider-capable smoke requires cloudflare_provider_http_adapter (NARADA_AI_* env bindings).`,
        service_health: serviceHealth,
        cloudflare_api_base_url: baseUrl,
        evidence_path: evidencePaths.evidencePath,
      }, evidencePaths, true);
    }
    phase(`creating provider-capable authority session ${sessionId}`);
    created = await postJson(`${baseUrl}/api/nars/authority/sessions`, { session_id: sessionId, site_id: siteId, agent_id: agentId });
    phase('checking declared provider capability before any turn');
    const declaredHealth = await getJson(`${sessionBase}/health`);
    phase('admitting one operator input with real provider dispatch');
    const admitted = await postJson(`${sessionBase}/input`, { method: 'conversation.send', payload: { message, source: 'provider-capable-live-smoke' } });
    phase('checking replay for provider turn evidence');
    const replay = await getJson(`${sessionBase}/events?since_sequence=0&max_events=50`);
    phase('checking graduated provider capability');
    const graduatedHealth = await getJson(`${sessionBase}/health`);
    phase('revoking the session');
    revoke = await revokeSession(sessionBase);
    cleanup = { status: revoke?.status === 'revoked' ? 'revoked' : 'revoke_failed', revoke };
    phase('checking post-revoke refusals');
    const refusedHealth = await getJson(`${sessionBase}/health`);
    const refusedReplay = await getJson(`${sessionBase}/events?since_sequence=0&max_events=20`);
    const refusedInput = await postJson(`${sessionBase}/input`, { method: 'conversation.send', payload: { message: 'after revoke', source: 'provider-capable-live-smoke' } });

    const replayEvents = Array.isArray(replay.events) ? replay.events.map((event) => event.payload?.event) : [];
    const capabilityProfile = graduatedHealth.runtime_surface_contract?.capability_profile ?? {};
    const capabilityEvidence = graduatedHealth.runtime_surface_contract?.capability_evidence ?? {};
    const passed = serviceHealth.status === 'healthy'
      && created.status === 'created'
      && created.session?.execution_mode === 'cloudflare_provider_http_adapter'
      && declaredHealth.status === 'healthy'
      && (declaredHealth.runtime_surface_contract?.capability_profile?.provider_execution === 'declared' || declaredHealth.runtime_surface_contract?.capability_profile?.provider_execution === 'present')
      && admitted.status === 'admitted'
      && admitted.execution_kind === 'cloudflare_provider_http_adapter'
      && replay.status === 'ok'
      && replayEvents.includes('provider_request')
      && replayEvents.includes('provider_response')
      && replayEvents.includes('assistant_message')
      && replayEvents.includes('turn_complete')
      && capabilityProfile.provider_execution === 'present'
      && capabilityEvidence.provider_execution?.state === 'present'
      && typeof capabilityEvidence.provider_execution?.evidence_ref === 'string'
      && revoke?.status === 'revoked'
      && refusedHealth.status === 'refused'
      && refusedHealth.code === 'session_revoked'
      && refusedReplay.status === 'refused'
      && refusedInput.status === 'refused';

    return evidence({
      schema: 'narada.cloudflare_nars_authority.live_smoke.v1',
      status: passed ? 'passed' : 'failed',
      smoke_lineage: 'provider-capable-live',
      cloudflare_api_base_url: baseUrl,
      session_id: sessionId,
      site_id: siteId,
      agent_id: agentId,
      authority_origin: 'cloudflare',
      authority_runtime_kind: 'cloudflare_provider_http_adapter_runtime',
      provider_evidence_kind: 'live_provider_dispatch',
      checks: { service_health: serviceHealth, created, declared_health: declaredHealth, admitted, replay, graduated_health: graduatedHealth, revoke, refused_health: refusedHealth, refused_replay: refusedReplay, refused_input: refusedInput, cleanup },
      evidence_path: evidencePaths.evidencePath,
      evidence_latest_path: evidencePaths.latestPath,
      evidence_index_path: evidencePaths.indexPath,
    }, evidencePaths, true);
  } catch (error) {
    if (created?.status === 'created' && !revoke) {
      phase('attempting cleanup revoke after failure');
      cleanup = await safeCleanupRevoke(sessionBase);
    }
    return evidence({
      schema: 'narada.cloudflare_nars_authority.live_smoke.v1',
      status: 'failed',
      code: 'provider_capable_live_smoke_error',
      smoke_lineage: 'provider-capable-live',
      error: error instanceof Error ? error.message : String(error),
      cloudflare_api_base_url: baseUrl,
      session_id: sessionId,
      cleanup,
      evidence_path: evidencePaths.evidencePath,
    }, evidencePaths, true);
  }
}

async function revokeSession(sessionBase) {
  return await fetch(sessionBase, { method: 'DELETE' }).then((response) => response.json().catch(() => ({ status: response.ok ? 'revoked' : 'unknown', http_status: response.status })));
}

async function safeCleanupRevoke(sessionBase) {
  try {
    const revoke = await revokeSession(sessionBase);
    return { status: revoke.status === 'revoked' ? 'revoked_after_failure' : 'cleanup_revoke_failed', revoke };
  } catch (error) {
    return { status: 'cleanup_revoke_failed', error: error instanceof Error ? error.message : String(error) };
  }
}

async function postJson(url, body) {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({ status: response.ok ? 'ok' : 'failed', http_status: response.status }));
  return { http_status: response.status, ...payload };
}

async function getJson(url) {
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({ status: response.ok ? 'ok' : 'failed', http_status: response.status }));
  return { http_status: response.status, ...payload };
}

function resolveEvidencePaths(lineage, options) {
  const root = resolve(process.cwd(), '.narada/crew/nars-projections');
  return {
    evidencePath: options.evidencePath ?? resolve(root, `${lineage}-${Date.now()}.json`),
    latestPath: options.evidenceLatestPath ?? resolve(root, `${lineage}-latest.json`),
    indexPath: options.evidenceIndexPath ?? resolve(root, `${lineage}-index.json`),
  };
}

function evidence(payload, paths, write) {
  const enriched = write
    ? { ...payload, evidence_latest_path: payload.evidence_latest_path ?? paths.latestPath, evidence_index_path: payload.evidence_index_path ?? paths.indexPath }
    : payload;
  if (write) {
    phase(`writing evidence to ${paths.evidencePath}`);
    mkdirSync(dirname(paths.evidencePath), { recursive: true });
    const body = `${JSON.stringify(enriched, null, 2)}\n`;
    writeFileSync(paths.evidencePath, body);
    writeFileSync(paths.latestPath, body);
    writeFileSync(paths.indexPath, `${JSON.stringify({
      schema: 'narada.smoke_evidence_index.v1',
      lineage: enriched.smoke_lineage ?? 'provider-capable-live',
      latest_status: enriched.status,
      latest_evidence_path: paths.evidencePath,
      latest_copy_path: paths.latestPath,
      latest_run_at: new Date().toISOString(),
      provider_evidence_kind: enriched.provider_evidence_kind ?? null,
    }, null, 2)}\n`);
  }
  return enriched;
}

function printResult(result) {
  if (args.format === 'json') {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(`\nCloudflare provider-capable live smoke: ${result.status}\n`);
  if (result.smoke_lineage) process.stdout.write(`Smoke lineage: ${result.smoke_lineage}\n`);
  if (result.authority_origin) process.stdout.write(`Authority origin: ${result.authority_origin}\n`);
  if (result.authority_runtime_kind) process.stdout.write(`Authority runtime: ${result.authority_runtime_kind}\n`);
  if (result.code) process.stdout.write(`Reason: ${result.code}\n`);
  if (result.detail) process.stdout.write(`Detail: ${result.detail}\n`);
  if (result.operator_action) process.stdout.write(`Action: ${result.operator_action}\n`);
  if (result.suggested_command) process.stdout.write(`Command: ${result.suggested_command}\n`);
  if (result.cloudflare_api_base_url) process.stdout.write(`Worker: ${result.cloudflare_api_base_url}\n`);
  if (result.session_id) process.stdout.write(`Session: ${result.session_id}\n`);
  if (result.checks) {
    const checks = Object.entries(result.checks).map(([name, value]) => `${name}=${value?.status ?? value?.ok ?? 'unknown'}`);
    if (checks.length) process.stdout.write(`Checks: ${checks.join(', ')}\n`);
  }
  if (result.cleanup) process.stdout.write(`Cleanup: ${result.cleanup.status}\n`);
  if (result.evidence_path) process.stdout.write(`Evidence: ${result.evidence_path}\n`);
  if (result.evidence_latest_path) process.stdout.write(`Latest evidence: ${result.evidence_latest_path}\n`);
  if (result.evidence_index_path) process.stdout.write(`Evidence index: ${result.evidence_index_path}\n`);
}

function phase(message) {
  if (args.format === 'json' || args.quiet) return;
  process.stdout.write(`provider-capable smoke: ${message}\n`);
}

function requiredArgs() {
  return ['--cloudflare-api-base-url'];
}

function liveCommand(baseUrl) {
  return `pnpm --filter @narada2/cloudflare-nars-projection smoke:provider-capable-live -- --live --cloudflare-api-base-url ${baseUrl}`;
}

function optionKey(option) {
  return option.replace(/^--/, '').replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function parseArgs(argv) {
  const options = { live: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--live') options.live = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--quiet') options.quiet = true;
    else if (arg.startsWith('--')) {
      const equalsIndex = arg.indexOf('=');
      if (equalsIndex > 0) options[optionKey(arg.slice(0, equalsIndex))] = arg.slice(equalsIndex + 1);
      else options[optionKey(arg)] = argv[index + 1], index += 1;
    }
  }
  return options;
}
