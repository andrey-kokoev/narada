#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  process.stdout.write([
    'Cloudflare NARS projection intelligence-boundary live smoke',
    '',
    'Planning mode:',
    '  pnpm --filter @narada2/cloudflare-nars-projection smoke:cloudflare-origin-live',
    '',
    'Live mode:',
    '  pnpm --filter @narada2/cloudflare-nars-projection smoke:cloudflare-origin-live -- --live --cloudflare-api-base-url <url>',
    '',
  ].join('\n'));
  process.exit(0);
}

const result = await run();
if (args.format === 'json') {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write(`[cloudflare-nars-projection:boundary] ${result.status}: ${result.code ?? 'checks_complete'}\n`);
  if (result.evidence_path) process.stdout.write(`evidence: ${result.evidence_path}\n`);
}
process.exitCode = result.status === 'passed' || result.status === 'planned' ? 0 : 1;

async function run() {
  if (!args.live) {
    return {
      schema: 'narada.cloudflare_nars_projection.intelligence_boundary_live_smoke.v1',
      status: 'planned',
      code: 'live_flag_required',
      purpose: 'Prove the projection Worker cannot become a second intelligence-selection or execution authority.',
      required: ['--live', '--cloudflare-api-base-url'],
    };
  }
  if (!args.cloudflareApiBaseUrl) {
    return persist({
      schema: 'narada.cloudflare_nars_projection.intelligence_boundary_live_smoke.v1',
      status: 'refused',
      code: 'cloudflare_api_base_url_required',
    });
  }

  const baseUrl = args.cloudflareApiBaseUrl.replace(/\/+$/, '');
  const sessionId = args.sessionId ?? `cf_projection_boundary_${Date.now()}`;
  const sessionBase = `${baseUrl}/api/nars/authority/sessions/${encodeURIComponent(sessionId)}`;
  let cleanup = { status: 'not_attempted' };

  try {
    phase('reading projection service health');
    const serviceHealth = await fetchJson(`${baseUrl}/api/nars/authority/health`);

    phase('creating projection session');
    const created = await fetchJson(`${baseUrl}/api/nars/authority/sessions`, {
      method: 'POST',
      body: {
        session_id: sessionId,
        site_id: args.siteId ?? 'narada.cloudflare.projection-boundary',
        agent_id: args.agentId ?? 'cloudflare.projection-boundary',
      },
    });

    phase('reading truthful degraded session health');
    const sessionHealth = await fetchJson(`${sessionBase}/health`);

    phase('proving input refusal occurs before admission');
    const refusedInput = await fetchJson(`${sessionBase}/input`, {
      method: 'POST',
      body: {
        method: 'conversation.send',
        payload: {
          message: 'This projection must not select or execute intelligence.',
          source: 'projection-boundary-live-smoke',
        },
      },
    });

    phase('proving replay contains no admitted input or generated output');
    const replay = await fetchJson(`${sessionBase}/events?since_sequence=0&max_events=20`);
    const replayKinds = Array.isArray(replay.body?.events)
      ? replay.body.events.map((event) => event?.payload?.event)
      : [];

    cleanup = await fetchJson(sessionBase, { method: 'DELETE' });
    const passed =
      serviceHealth.body?.status === 'degraded'
      && serviceHealth.body?.execution === 'canonical_invokable_intelligence_gateway'
      && serviceHealth.body?.execution_availability === 'unavailable'
      && serviceHealth.body?.code === 'canonical_invokable_intelligence_gateway_required'
      && created.body?.status === 'created'
      && created.body?.session?.execution_mode === 'canonical_invokable_intelligence_gateway'
      && sessionHealth.body?.status === 'degraded'
      && sessionHealth.body?.execution_availability === 'unavailable'
      && sessionHealth.body?.code === 'canonical_invokable_intelligence_gateway_required'
      && refusedInput.body?.status === 'refused'
      && refusedInput.body?.code === 'canonical_invokable_intelligence_gateway_required'
      && replay.body?.status === 'ok'
      && replayKinds.length === 1
      && replayKinds[0] === 'session_started'
      && cleanup.body?.status === 'revoked';

    return persist({
      schema: 'narada.cloudflare_nars_projection.intelligence_boundary_live_smoke.v1',
      status: passed ? 'passed' : 'failed',
      code: passed ? 'projection_boundary_verified' : 'projection_boundary_check_failed',
      cloudflare_api_base_url: baseUrl,
      session_id: sessionId,
      checks: {
        service_health: serviceHealth,
        created,
        session_health: sessionHealth,
        refused_input: refusedInput,
        replay: { ...replay, event_kinds: replayKinds },
        cleanup,
      },
    });
  } catch (error) {
    try {
      cleanup = await fetchJson(sessionBase, { method: 'DELETE' });
    } catch {
      cleanup = { status: 'cleanup_failed' };
    }
    return persist({
      schema: 'narada.cloudflare_nars_projection.intelligence_boundary_live_smoke.v1',
      status: 'failed',
      code: 'projection_boundary_live_smoke_error',
      error: error instanceof Error ? error.message : String(error),
      cloudflare_api_base_url: baseUrl,
      session_id: sessionId,
      cleanup,
    });
  }
}

async function fetchJson(url, { method = 'GET', body } = {}) {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { parse_error: 'invalid_json', text_sample: text.slice(0, 500) };
  }
  return { http_status: response.status, ok: response.ok, body: parsed };
}

function persist(result) {
  const evidencePath = resolve(args.evidencePath ?? '../../.narada/evidence/cloudflare-nars-projection-boundary-live.json');
  const evidence = { ...result, observed_at: new Date().toISOString(), evidence_path: evidencePath };
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  return evidence;
}

function phase(message) {
  if (!args.quiet && args.format !== 'json') process.stderr.write(`[cloudflare-nars-projection:boundary] ${message}\n`);
}

function parseArgs(values) {
  const parsed = {
    live: false,
    quiet: false,
    help: false,
    format: 'human',
    cloudflareApiBaseUrl: null,
    evidencePath: null,
    sessionId: null,
    siteId: null,
    agentId: null,
  };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--') continue;
    if (value === '--live') parsed.live = true;
    else if (value === '--quiet') parsed.quiet = true;
    else if (value === '--help' || value === '-h') parsed.help = true;
    else if (value === '--format') parsed.format = values[++index] ?? 'human';
    else if (value === '--cloudflare-api-base-url') parsed.cloudflareApiBaseUrl = values[++index] ?? null;
    else if (value === '--evidence-path') parsed.evidencePath = values[++index] ?? null;
    else if (value === '--session-id') parsed.sessionId = values[++index] ?? null;
    else if (value === '--site-id') parsed.siteId = values[++index] ?? null;
    else if (value === '--agent-id') parsed.agentId = values[++index] ?? null;
    else throw new Error(`unknown_option:${value}`);
  }
  return parsed;
}
