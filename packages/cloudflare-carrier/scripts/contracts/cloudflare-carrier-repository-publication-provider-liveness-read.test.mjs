import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatRepositoryPublicationProviderLivenessReadText,
  parseRepositoryPublicationProviderLivenessReadArgs,
  readRepositoryPublicationProviderLiveness,
  summarizeRepositoryPublicationProviderLiveness,
} from '../workflows/cloudflare-carrier-repository-publication-provider-liveness-read.mjs';

test('parseRepositoryPublicationProviderLivenessReadArgs reuses direct heartbeat list parsing', () => {
  const parsed = parseRepositoryPublicationProviderLivenessReadArgs([
    '--url', 'https://carrier.example.test',
    '--site', 'site_alpha',
    '--focus-ref', 'heartbeat_repo_alpha',
    '--operator-session-cookie', 'operator-session-cookie',
    '--format', 'text',
  ], {});

  assert.equal(parsed.workerUrl, 'https://carrier.example.test');
  assert.equal(parsed.operation, 'repository_publication.provider_heartbeat.list');
  assert.equal(parsed.params.site_id, 'site_alpha');
  assert.equal(parsed.focusHeartbeatId, 'heartbeat_repo_alpha');
  assert.equal(parsed.format, 'text');
  assert.equal(parsed.auth.kind, 'operator_session');
});

test('summarizeRepositoryPublicationProviderLiveness lifts latest heartbeat and scheduler posture', () => {
  const summary = summarizeRepositoryPublicationProviderLiveness({
    site_id: 'site_alpha',
    repository_publication_provider_heartbeat_count: 1,
    provider_liveness_authority: 'cloudflare_repository_publication_provider_liveness_store',
    repository_publication_provider_liveness: {
      state: 'fresh',
      next_action: 'monitor_repository_publication_provider_liveness',
      provider_authority: 'windows_repository_publication_executor',
      scheduler_posture: {
        state: 'fresh_from_scheduled_refresh',
        task_name: '\\Narada\\CloudflareProviderLivenessRefresh',
        interval_minutes: 2,
      },
    },
    repository_publication_provider_heartbeats: [{
      repository_publication_provider_heartbeat_id: 'heartbeat_repo_alpha',
      status: 'completed_and_recorded',
      generated_at: '2026-06-13T03:46:01.000Z',
      last_run_at: '2026-06-13T03:46:00.000Z',
      provider_id: 'windows_repository_publication_executor',
      provider_embodiment: 'windows_current_user_repository_publication_executor',
      provider_refresh_trigger: 'windows_task_scheduler',
    }],
  });

  assert.equal(summary.state, 'fresh');
  assert.equal(summary.scheduler_task_name, '\\Narada\\CloudflareProviderLivenessRefresh');
  assert.equal(summary.latest_heartbeat_id, 'heartbeat_repo_alpha');
  assert.equal(summary.latest_status, 'completed_and_recorded');
});

test('summarizeRepositoryPublicationProviderLiveness narrows to a focused heartbeat', () => {
  const summary = summarizeRepositoryPublicationProviderLiveness({
    site_id: 'site_alpha',
    repository_publication_provider_heartbeat_count: 2,
    repository_publication_provider_heartbeats: [
      { repository_publication_provider_heartbeat_id: 'heartbeat_repo_beta', status: 'completed_and_recorded' },
      { repository_publication_provider_heartbeat_id: 'heartbeat_repo_alpha', status: 'completed_and_recorded' },
    ],
  }, { focusHeartbeatId: 'heartbeat_repo_alpha' });

  assert.equal(summary.heartbeat_count, 1);
  assert.equal(summary.focused_repository_publication_provider_heartbeat_id, 'heartbeat_repo_alpha');
  assert.equal(summary.latest_heartbeat_id, 'heartbeat_repo_alpha');
});

test('readRepositoryPublicationProviderLiveness returns summarized provider liveness', async () => {
  const result = await readRepositoryPublicationProviderLiveness({
    workerUrl: 'https://carrier.example.test',
    operation: 'repository_publication.provider_heartbeat.list',
    params: { site_id: 'site_alpha' },
    auth: { kind: 'operator_session', value: 'cookie-value', source: 'operator-session-file' },
  }, async () => ({
    status: 200,
    ok: true,
    text: async () => JSON.stringify({
      site_id: 'site_alpha',
      provider_liveness_authority: 'cloudflare_repository_publication_provider_liveness_store',
      repository_publication_provider_heartbeat_count: 1,
      repository_publication_provider_liveness: {
        state: 'fresh',
        provider_authority: 'windows_repository_publication_executor',
        scheduler_posture: { state: 'fresh_from_scheduled_refresh' },
      },
      repository_publication_provider_heartbeats: [{ repository_publication_provider_heartbeat_id: 'heartbeat_repo_alpha', status: 'completed_and_recorded' }],
    }),
    json: async () => ({
      site_id: 'site_alpha',
      provider_liveness_authority: 'cloudflare_repository_publication_provider_liveness_store',
      repository_publication_provider_heartbeat_count: 1,
      repository_publication_provider_liveness: {
        state: 'fresh',
        provider_authority: 'windows_repository_publication_executor',
        scheduler_posture: { state: 'fresh_from_scheduled_refresh' },
      },
      repository_publication_provider_heartbeats: [{ repository_publication_provider_heartbeat_id: 'heartbeat_repo_alpha', status: 'completed_and_recorded' }],
    }),
  }));

  assert.equal(result.schema, 'narada.cloudflare_carrier.repository_publication_provider_liveness_read.v1');
  assert.equal(result.summary.state, 'fresh');
  assert.equal(result.summary.latest_heartbeat_id, 'heartbeat_repo_alpha');
});

test('readRepositoryPublicationProviderLiveness rejects missing focused heartbeat ids', async () => {
  await assert.rejects(
    () => readRepositoryPublicationProviderLiveness({
      workerUrl: 'https://carrier.example.test',
      operation: 'repository_publication.provider_heartbeat.list',
      params: { site_id: 'site_alpha' },
      auth: { kind: 'operator_session', value: 'cookie-value', source: 'operator-session-file' },
      focusHeartbeatId: 'heartbeat_repo_missing',
    }, async () => ({
      status: 200,
      ok: true,
      text: async () => JSON.stringify({
        site_id: 'site_alpha',
        repository_publication_provider_heartbeats: [{ repository_publication_provider_heartbeat_id: 'heartbeat_repo_alpha', status: 'completed_and_recorded' }],
      }),
    })),
    /repository_publication_provider_liveness_read_focus_not_found:heartbeat_repo_missing/,
  );
});

test('formatRepositoryPublicationProviderLivenessReadText prints provider liveness summary', () => {
  const text = formatRepositoryPublicationProviderLivenessReadText({
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      state: 'fresh',
      next_action: 'refresh_provider_liveness_state',
      provider_liveness_authority: 'cloudflare_repository_publication_provider_liveness_store',
      scheduler_state: 'fresh_from_scheduled_refresh',
      scheduler_task_name: '\\Narada\\CloudflareProviderLivenessRefresh',
      scheduler_interval_minutes: 2,
      provider_authority: 'windows_repository_publication_executor',
      latest_provider_id: 'windows_repository_publication_executor',
      latest_provider_embodiment: 'windows_current_user_repository_publication_executor',
      latest_refresh_trigger: 'windows_task_scheduler',
      heartbeat_count: 1,
      latest_heartbeat_id: 'heartbeat_repo_alpha',
      latest_status: 'completed_and_recorded',
      latest_generated_at: '2026-06-13T03:46:01.000Z',
      latest_last_run_at: '2026-06-13T03:46:00.000Z',
    },
  });

  assert.match(text, /Repository Publication Provider Liveness: ok/);
  assert.match(text, /Liveness: state=fresh next=refresh_provider_liveness_state authority=cloudflare_repository_publication_provider_liveness_store/);
  assert.match(text, /Scheduler: state=fresh_from_scheduled_refresh task=\\Narada\\CloudflareProviderLivenessRefresh interval=2/);
  assert.match(text, /Heartbeats: count=1 latest=heartbeat_repo_alpha status=completed_and_recorded/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file> --execute-site-next/);
  assert.match(text, /Posture Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:posture:coherence:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Durability Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:durability:coherence:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Provider Liveness Refresh: pnpm --filter @narada2\/cloudflare-carrier provider-liveness:refresh:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
});

test('formatRepositoryPublicationProviderLivenessReadText uses focused labels for focused reads', () => {
  const text = formatRepositoryPublicationProviderLivenessReadText({
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      heartbeat_count: 1,
      focused_repository_publication_provider_heartbeat_id: 'heartbeat_repo_alpha',
      latest_heartbeat_id: 'heartbeat_repo_alpha',
      latest_status: 'completed_and_recorded',
      latest_generated_at: '2026-06-13T03:46:01.000Z',
      latest_last_run_at: '2026-06-13T03:46:00.000Z',
    },
  });

  assert.match(text, /Heartbeats: count=1 focused=heartbeat_repo_alpha status=completed_and_recorded/);
  assert.match(text, /Focused Timing: generated=2026-06-13T03:46:01.000Z last_run=2026-06-13T03:46:00.000Z/);
});

test('formatRepositoryPublicationProviderLivenessReadText suppresses refresh handoff for passive next action', () => {
  const text = formatRepositoryPublicationProviderLivenessReadText({
    worker_url: 'https://carrier.example.test',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      next_action: 'monitor_repository_publication_provider_liveness',
    },
  });

  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file> --execute-site-next/);
  assert.match(text, /Posture Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:posture:coherence:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Durability Coherence Review: pnpm --filter @narada2\/cloudflare-carrier product:durability:coherence:live:text -- --url https:\/\/carrier\.example\.test --site site_alpha --operator-session-file <operator-session-file>/);
  assert.doesNotMatch(text, /Provider Liveness Refresh:/);
});

test('formatRepositoryPublicationProviderLivenessReadText suppresses worker-scoped handoffs without worker url', () => {
  const text = formatRepositoryPublicationProviderLivenessReadText({
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      next_action: 'refresh_provider_liveness_state',
    },
  });
});

test('formatRepositoryPublicationProviderLivenessReadText suppresses worker-scoped handoffs without worker url', () => {
  const text = formatRepositoryPublicationProviderLivenessReadText({
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      next_action: 'refresh_provider_liveness_state',
    },
  });

  assert.doesNotMatch(text, /<worker-url>/);
  assert.doesNotMatch(text, /Site Read:/);
  assert.doesNotMatch(text, /Site Next Workflow:/);
  assert.doesNotMatch(text, /Posture Coherence Review:/);
  assert.doesNotMatch(text, /Durability Coherence Review:/);
  assert.doesNotMatch(text, /Provider Liveness Refresh:/);
});
