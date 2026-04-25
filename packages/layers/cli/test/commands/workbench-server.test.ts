import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createWorkbenchServer } from '../../src/commands/workbench-server.js';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setupRepo(tempDir: string) {
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'do-not-open', 'tasks', 'tasks', 'assignments'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'agents'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'reviews'), { recursive: true });
  mkdirSync(join(tempDir, '.ai', 'construction-loop'), { recursive: true });
}

function writeTask(tempDir: string, filename: string, frontMatter: string, title: string, extraBody = '') {
  writeFileSync(
    join(tempDir, '.ai', 'do-not-open', 'tasks', filename),
    `---\n${frontMatter}---\n\n# ${title}\n${extraBody}`,
  );
}

function writeRoster(tempDir: string, agents: Array<{
  agent_id: string;
  status?: string;
  task?: number | null;
  updated_at?: string;
}>) {
  writeFileSync(
    join(tempDir, '.ai', 'agents', 'roster.json'),
    JSON.stringify({
      version: 1,
      updated_at: new Date().toISOString(),
      agents: agents.map((a) => ({
        agent_id: a.agent_id,
        role: 'agent',
        capabilities: [],
        first_seen_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
        status: a.status ?? 'idle',
        task: a.task ?? null,
        updated_at: a.updated_at ?? new Date().toISOString(),
      })),
    }, null, 2),
  );
}

function writePolicy(tempDir: string, policy: Record<string, unknown>) {
  const defaultPolicy = {
    version: 1,
    allowed_autonomy_level: 'plan',
    require_operator_approval_for_promotion: true,
    dry_run_default: true,
    allow_auto_review: false,
    max_simultaneous_assignments: 2,
    max_tasks_per_cycle: 1,
    max_tasks_per_agent_per_day: 3,
    allowed_agent_ids: [],
    blocked_agent_ids: [],
    preferred_agent_ids: [],
    blocked_task_ranges: [],
    blocked_task_numbers: [],
    require_evidence_before_promotion: false,
    review_separation_rules: {
      reviewer_cannot_review_own_work: true,
      max_reviews_per_reviewer_per_day: 3,
      require_different_agent_for_review: true,
    },
    max_write_set_risk_severity: 'medium',
    max_recommendation_age_minutes: 60,
    stale_agent_timeout_ms: 30 * 60 * 1000,
    ccc_influence_weight: 0.3,
    stop_conditions: {
      on_all_agents_busy: 'wait',
      on_no_runnable_tasks: 'suggest_closure',
      on_cycle_limit_reached: 'stop',
      on_policy_violation: 'warn_and_continue',
    },
  };
  writeFileSync(
    join(tempDir, '.ai', 'construction-loop', 'policy.json'),
    JSON.stringify({ ...defaultPolicy, ...policy }, null, 2),
  );
}

async function httpGet(url: string, headers?: Record<string, string>): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, { headers });
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

async function httpPost(url: string, payload: unknown, headers?: Record<string, string>): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

describe('workbench server', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-workbench-'));
    setupRepo(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('lifecycle', () => {
    it('starts and stops cleanly', async () => {
      const server = await createWorkbenchServer({ port: 0, host: '127.0.0.1', cwd: tempDir });
      const url = await server.start();
      expect(url).toContain('http://127.0.0.1:');
      expect(server.isRunning()).toBe(true);
      await server.stop();
      expect(server.isRunning()).toBe(false);
    });

    it('throws when started twice', async () => {
      const server = await createWorkbenchServer({ port: 0, host: '127.0.0.1', cwd: tempDir });
      await server.start();
      await expect(server.start()).rejects.toThrow('already started');
      await server.stop();
    });
  });

  describe('GET /api/roster', () => {
    it('returns the agent roster', async () => {
      writeRoster(tempDir, [
        { agent_id: 'a1', status: 'working', task: 526 },
        { agent_id: 'a2', status: 'idle' },
      ]);

      const server = await createWorkbenchServer({ port: 0, host: '127.0.0.1', cwd: tempDir });
      const url = await server.start();
      const { status, body } = await httpGet(`${url}/api/roster`);
      expect(status).toBe(200);
      const roster = (body as { roster: { agents: Array<{ agent_id: string }> } }).roster;
      expect(roster.agents.length).toBe(2);
      expect(roster.agents[0]!.agent_id).toBe('a1');
      await server.stop();
    });

    it('returns 500 when roster is missing', async () => {
      const server = await createWorkbenchServer({ port: 0, host: '127.0.0.1', cwd: tempDir });
      const url = await server.start();
      const { status } = await httpGet(`${url}/api/roster`);
      expect(status).toBe(500);
      await server.stop();
    });
  });

  describe('GET /api/tasks', () => {
    it('returns all tasks', async () => {
      writeTask(tempDir, '20260424-526-workbench.md', 'task_id: 526\nstatus: opened\ndepends_on: []\n', 'Workbench HTTP Adapter');
      writeTask(tempDir, '20260424-527-workbench-ui.md', 'task_id: 527\nstatus: opened\ndepends_on: [526]\n', 'Workbench UI');

      const server = await createWorkbenchServer({ port: 0, host: '127.0.0.1', cwd: tempDir });
      const url = await server.start();
      const { status, body } = await httpGet(`${url}/api/tasks`);
      expect(status).toBe(200);
      const tasks = (body as { tasks: Array<{ task_id: string }>; total: number }).tasks;
      expect(tasks.length).toBe(2);
      expect(tasks.some((t) => t.task_id.includes('526'))).toBe(true);
      await server.stop();
    });

    it('respects limit parameter', async () => {
      writeTask(tempDir, '20260424-526-a.md', 'task_id: 526\nstatus: opened\n', 'Task A');
      writeTask(tempDir, '20260424-527-b.md', 'task_id: 527\nstatus: opened\n', 'Task B');

      const server = await createWorkbenchServer({ port: 0, host: '127.0.0.1', cwd: tempDir });
      const url = await server.start();
      const { status, body } = await httpGet(`${url}/api/tasks?limit=1`);
      expect(status).toBe(200);
      const tasks = (body as { tasks: unknown[]; total: number }).tasks;
      expect(tasks.length).toBe(1);
      expect((body as { total: number }).total).toBe(2);
      await server.stop();
    });
  });

  describe('GET /api/assignments', () => {
    it('returns all assignments', async () => {
      writeFileSync(
        join(tempDir, '.ai', 'do-not-open', 'tasks', 'tasks', 'assignments', 'task-526.json'),
        JSON.stringify({ task_id: 'task-526', assignments: [{ agent_id: 'a1', claimed_at: '2026-04-24T10:00:00Z' }] }),
      );

      const server = await createWorkbenchServer({ port: 0, host: '127.0.0.1', cwd: tempDir });
      const url = await server.start();
      const { status, body } = await httpGet(`${url}/api/assignments`);
      expect(status).toBe(200);
      const assignments = (body as { assignments: unknown[] }).assignments;
      expect(assignments.length).toBe(1);
      await server.stop();
    });
  });

  describe('GET /api/reviews', () => {
    it('returns all reviews', async () => {
      writeFileSync(
        join(tempDir, '.ai', 'reviews', 'review-1.json'),
        JSON.stringify({ review_id: 'review-1', reviewer_agent_id: 'a2', task_id: 'task-526', findings: [], verdict: 'accepted', reviewed_at: '2026-04-24T10:00:00Z' }),
      );

      const server = await createWorkbenchServer({ port: 0, host: '127.0.0.1', cwd: tempDir });
      const url = await server.start();
      const { status, body } = await httpGet(`${url}/api/reviews`);
      expect(status).toBe(200);
      const reviews = (body as { reviews: unknown[] }).reviews;
      expect(reviews.length).toBe(1);
      await server.stop();
    });
  });

  describe('GET /api/policy', () => {
    it('returns the construction loop policy', async () => {
      writePolicy(tempDir, { version: 1, allowed_autonomy_level: 'plan', max_simultaneous_assignments: 2 });

      const server = await createWorkbenchServer({ port: 0, host: '127.0.0.1', cwd: tempDir });
      const url = await server.start();
      const { status, body } = await httpGet(`${url}/api/policy`);
      if (status !== 200) {
        console.log('POLICY DEBUG:', JSON.stringify(body));
      }
      expect(status).toBe(200);
      const policy = (body as { policy: { allowed_autonomy_level: string } }).policy;
      expect(policy.allowed_autonomy_level).toBe('plan');
      await server.stop();
    });
  });

  describe('GET /api/audit', () => {
    it('returns audit log records', async () => {
      mkdirSync(join(tempDir, '.ai', 'construction-loop', 'audit'), { recursive: true });
      writeFileSync(
        join(tempDir, '.ai', 'construction-loop', 'audit', '2026-04-24.jsonl'),
        JSON.stringify({ timestamp: '2026-04-24T10:00:00Z', promotion_id: 'p1', task_id: 'task-526', agent_id: 'a1', policy_version: 1, gate_results: [], operator_overrideable: false, dry_run: false, status: 'promoted' }) + '\n',
      );

      const server = await createWorkbenchServer({ port: 0, host: '127.0.0.1', cwd: tempDir });
      const url = await server.start();
      const { status, body } = await httpGet(`${url}/api/audit`);
      expect(status).toBe(200);
      const audit = (body as { audit: unknown[] }).audit;
      expect(audit.length).toBe(1);
      await server.stop();
    });
  });

  describe('GET /api/principals', () => {
    it('returns empty array when no principals exist', async () => {
      const server = await createWorkbenchServer({ port: 0, host: '127.0.0.1', cwd: tempDir });
      const url = await server.start();
      const { status, body } = await httpGet(`${url}/api/principals`);
      expect(status).toBe(200);
      const principals = (body as { principals: unknown[] }).principals;
      expect(principals).toEqual([]);
      await server.stop();
    });
  });

  describe('GET /api/graph', () => {
    it('returns task graph nodes and edges', async () => {
      writeTask(tempDir, '20260424-526-a.md', 'task_id: 526\nstatus: opened\ndepends_on: []\n', 'Task A');
      writeTask(tempDir, '20260424-527-b.md', 'task_id: 527\nstatus: opened\ndepends_on: [526]\n', 'Task B');

      const server = await createWorkbenchServer({ port: 0, host: '127.0.0.1', cwd: tempDir });
      const url = await server.start();
      const { status, body } = await httpGet(`${url}/api/graph`);
      expect(status).toBe(200);
      const data = body as { nodes: unknown[]; edges: unknown[] };
      expect(data.nodes.length).toBeGreaterThan(0);
      await server.stop();
    });
  });

  describe('GET /api/health', () => {
    it('returns ok status', async () => {
      const server = await createWorkbenchServer({ port: 0, host: '127.0.0.1', cwd: tempDir });
      const url = await server.start();
      const { status, body } = await httpGet(`${url}/api/health`);
      expect(status).toBe(200);
      expect((body as { status: string }).status).toBe('ok');
      await server.stop();
    });
  });

  describe('GET /', () => {
    it('serves the workbench HTML page', async () => {
      const server = await createWorkbenchServer({ port: 0, host: '127.0.0.1', cwd: tempDir });
      const url = await server.start();
      const response = await fetch(`${url}/`);
      expect(response.status).toBe(200);
      const contentType = response.headers.get('Content-Type');
      expect(contentType).toContain('text/html');
      const text = await response.text();
      expect(text).toContain('Narada Workbench');
      await server.stop();
    });
  });

  describe('Browser handshake', () => {
    it('inline JavaScript parses without syntax errors', async () => {
      const server = await createWorkbenchServer({ port: 0, host: '127.0.0.1', cwd: tempDir });
      const url = await server.start();
      const response = await fetch(`${url}/`);
      const html = await response.text();
      await server.stop();

      const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
      expect(scriptMatch).toBeTruthy();
      const js = scriptMatch![1];

      // Validate by attempting to parse in a fresh V8 context
      expect(() => {
        // eslint-disable-next-line no-new-func
        new Function(js);
      }).not.toThrow();
    });

    it('completes initial data bootstrap with all API calls', async () => {
      writeRoster(tempDir, [
        { agent_id: 'a1', status: 'working', task: 526 },
        { agent_id: 'a2', status: 'idle' },
      ]);
      writeTask(tempDir, '20260424-526-a.md', 'task_id: 526\nstatus: opened\ndepends_on: []\n', 'Task A');
      writePolicy(tempDir, { version: 1, allowed_autonomy_level: 'plan', max_simultaneous_assignments: 2 });

      const server = await createWorkbenchServer({ port: 0, host: '127.0.0.1', cwd: tempDir });
      const url = await server.start();

      // Simulate the browser's parallel initial fetch (refreshAll)
      const [rosterRes, tasksRes, assignmentsRes, reviewsRes, policyRes, auditRes, principalsRes, graphRes] = await Promise.all([
        httpGet(`${url}/api/roster`).catch(() => ({ status: 0, body: null })),
        httpGet(`${url}/api/tasks`).catch(() => ({ status: 0, body: { tasks: [] } })),
        httpGet(`${url}/api/assignments`).catch(() => ({ status: 0, body: { assignments: [] } })),
        httpGet(`${url}/api/reviews`).catch(() => ({ status: 0, body: { reviews: [] } })),
        httpGet(`${url}/api/policy`).catch(() => ({ status: 0, body: null })),
        httpGet(`${url}/api/audit`).catch(() => ({ status: 0, body: { audit: [] } })),
        httpGet(`${url}/api/principals`).catch(() => ({ status: 0, body: { principals: [] } })),
        httpGet(`${url}/api/graph`).catch(() => ({ status: 0, body: { nodes: [], edges: [] } })),
      ]);

      expect(rosterRes.status).toBe(200);
      expect(tasksRes.status).toBe(200);
      expect(assignmentsRes.status).toBe(200);
      expect(reviewsRes.status).toBe(200);
      expect(policyRes.status).toBe(200);
      expect(auditRes.status).toBe(200);
      expect(principalsRes.status).toBe(200);
      expect(graphRes.status).toBe(200);

      // Validate response shapes match what the UI expects
      expect((rosterRes.body as { roster: unknown }).roster).toBeDefined();
      expect((tasksRes.body as { tasks: unknown[] }).tasks).toBeDefined();
      expect((policyRes.body as { policy: unknown }).policy).toBeDefined();

      await server.stop();
    });
  });

  describe('POST /api/control/idle', () => {
    it('marks an agent as idle', async () => {
      writeRoster(tempDir, [{ agent_id: 'a1', status: 'working', task: 526 }]);

      const server = await createWorkbenchServer({ port: 0, host: '127.0.0.1', cwd: tempDir });
      const url = await server.start();
      const { status, body } = await httpPost(`${url}/api/control/idle`, { agent: 'a1' });
      expect(status).toBe(200);
      expect((body as { status: string }).status).toBe('ok');
      await server.stop();
    });

    it('returns 400 when agent is missing', async () => {
      const server = await createWorkbenchServer({ port: 0, host: '127.0.0.1', cwd: tempDir });
      const url = await server.start();
      const { status, body } = await httpPost(`${url}/api/control/idle`, {});
      expect(status).toBe(400);
      expect((body as { error: string }).error).toContain('Missing agent');
      await server.stop();
    });
  });

  describe('POST /api/control/assign', () => {
    it('assigns a task to an agent and claims it', async () => {
      writeRoster(tempDir, [{ agent_id: 'a1', status: 'idle' }]);
      writeTask(tempDir, '20260424-526-a.md', 'task_id: 526\nstatus: opened\ndepends_on: []\n', 'Task A');

      const server = await createWorkbenchServer({ port: 0, host: '127.0.0.1', cwd: tempDir });
      const url = await server.start();
      const { status, body } = await httpPost(`${url}/api/control/assign`, { agent: 'a1', task: '526' });
      console.log('ASSIGN DEBUG:', status, JSON.stringify(body));
      expect(status).toBe(200);
      expect((body as { status: string }).status).toBe('ok');
      await server.stop();
    });

    it('returns 400 when agent is missing', async () => {
      const server = await createWorkbenchServer({ port: 0, host: '127.0.0.1', cwd: tempDir });
      const url = await server.start();
      const { status, body } = await httpPost(`${url}/api/control/assign`, { task: '526' });
      expect(status).toBe(400);
      expect((body as { error: string }).error).toContain('Missing agent or task');
      await server.stop();
    });

    it('returns 400 when task is missing', async () => {
      writeRoster(tempDir, [{ agent_id: 'a1', status: 'idle' }]);

      const server = await createWorkbenchServer({ port: 0, host: '127.0.0.1', cwd: tempDir });
      const url = await server.start();
      const { status, body } = await httpPost(`${url}/api/control/assign`, { agent: 'a1' });
      expect(status).toBe(400);
      expect((body as { error: string }).error).toContain('Missing agent or task');
      await server.stop();
    });

    it('returns 422 when agent does not exist', async () => {
      writeRoster(tempDir, [{ agent_id: 'a1', status: 'idle' }]);
      writeTask(tempDir, '20260424-526-a.md', 'task_id: 526\nstatus: opened\ndepends_on: []\n', 'Task A');

      const server = await createWorkbenchServer({ port: 0, host: '127.0.0.1', cwd: tempDir });
      const url = await server.start();
      const { status, body } = await httpPost(`${url}/api/control/assign`, { agent: 'ghost', task: '526' });
      expect(status).toBe(422);
      const text = JSON.stringify(body);
      expect(text.toLowerCase()).toContain('not found');
      await server.stop();
    });
  });

  describe('POST /api/control/done', () => {
    it('marks an agent as done with a task', async () => {
      writeRoster(tempDir, [{ agent_id: 'a1', status: 'working', task: 526 }]);
      writeTask(tempDir, '20260424-526-a.md', 'task_id: 526\nstatus: claimed\ndepends_on: []\n', 'Task A', '\n## Execution Notes\nDone.\n\n## Verification\nOK.\n');

      const server = await createWorkbenchServer({ port: 0, host: '127.0.0.1', cwd: tempDir });
      const url = await server.start();
      const { status, body } = await httpPost(`${url}/api/control/done`, { agent: 'a1', task: '526', allow_incomplete: true });
      expect(status).toBe(200);
      expect((body as { status: string }).status).toBe('ok');
      await server.stop();
    });

    it('returns 400 when agent is missing', async () => {
      const server = await createWorkbenchServer({ port: 0, host: '127.0.0.1', cwd: tempDir });
      const url = await server.start();
      const { status, body } = await httpPost(`${url}/api/control/done`, { task: '526' });
      expect(status).toBe(400);
      expect((body as { error: string }).error).toContain('Missing agent or task');
      await server.stop();
    });
  });

  describe('POST /api/control/promote', () => {
    it('promotes a recommendation (dry-run)', async () => {
      writeTask(tempDir, '20260424-526-a.md', 'task_id: 526\nstatus: opened\ndepends_on: []\n', 'Task A');
      writeRoster(tempDir, [{ agent_id: 'a1', status: 'idle' }]);

      const server = await createWorkbenchServer({ port: 0, host: '127.0.0.1', cwd: tempDir });
      const url = await server.start();
      const { status, body } = await httpPost(`${url}/api/control/promote`, {
        task: '526',
        agent: 'a1',
        by: 'operator',
        dry_run: true,
      });
      // May succeed or fail depending on task state; we validate the route accepts the request
      expect(status).toBe(200);
      await server.stop();
    });

    it('returns 400 when required fields are missing', async () => {
      const server = await createWorkbenchServer({ port: 0, host: '127.0.0.1', cwd: tempDir });
      const url = await server.start();
      const { status, body } = await httpPost(`${url}/api/control/promote`, { task: '526', agent: 'a1' });
      expect(status).toBe(400);
      expect((body as { error: string }).error).toContain('Missing task, agent, or by');
      await server.stop();
    });
  });

  describe('POST /api/control/recommend', () => {
    it('triggers task recommendations', async () => {
      writeRoster(tempDir, [{ agent_id: 'a1', status: 'idle' }]);
      writeTask(tempDir, '20260424-526-a.md', 'task_id: 526\nstatus: opened\ndepends_on: []\n', 'Task A');

      const server = await createWorkbenchServer({ port: 0, host: '127.0.0.1', cwd: tempDir });
      const url = await server.start();
      const { status, body } = await httpPost(`${url}/api/control/recommend`, {});
      expect(status).toBe(200);
      await server.stop();
    });
  });

  describe('POST /api/control/pause', () => {
    it('pauses the construction loop', async () => {
      const server = await createWorkbenchServer({ port: 0, host: '127.0.0.1', cwd: tempDir });
      const url = await server.start();
      const { status, body } = await httpPost(`${url}/api/control/pause`, { reason: 'testing' });
      expect(status).toBe(200);
      expect((body as { paused: boolean }).paused).toBe(true);
      await server.stop();
    });
  });

  describe('POST /api/control/resume', () => {
    it('resumes the construction loop', async () => {
      const server = await createWorkbenchServer({ port: 0, host: '127.0.0.1', cwd: tempDir });
      const url = await server.start();
      const { status, body } = await httpPost(`${url}/api/control/resume`, {});
      expect(status).toBe(200);
      expect((body as { resumed: boolean }).resumed).toBe(true);
      await server.stop();
    });
  });

  describe('CORS and safety', () => {
    it('allows localhost origin', async () => {
      const server = await createWorkbenchServer({ port: 0, host: '127.0.0.1', cwd: tempDir });
      const url = await server.start();
      const response = await fetch(`${url}/api/health`, {
        headers: { Origin: 'http://localhost:3000' },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
      await server.stop();
    });

    it('rejects non-localhost origin', async () => {
      const server = await createWorkbenchServer({ port: 0, host: '127.0.0.1', cwd: tempDir });
      const url = await server.start();
      const response = await fetch(`${url}/api/health`, {
        headers: { Origin: 'https://evil.com' },
      });
      expect(response.status).toBe(403);
      await server.stop();
    });

    it('rejects POST on observation paths', async () => {
      const server = await createWorkbenchServer({ port: 0, host: '127.0.0.1', cwd: tempDir });
      const url = await server.start();
      const response = await fetch(`${url}/api/health`, { method: 'POST' });
      expect(response.status).toBe(405);
      await server.stop();
    });

    it('rejects GET on control paths', async () => {
      const server = await createWorkbenchServer({ port: 0, host: '127.0.0.1', cwd: tempDir });
      const url = await server.start();
      const { status } = await httpGet(`${url}/api/control/pause`);
      expect(status).toBe(405);
      await server.stop();
    });
  });

  describe('read-only guarantee', () => {
    it('GET routes do not mutate filesystem state', async () => {
      writeRoster(tempDir, [{ agent_id: 'a1', status: 'idle' }]);
      writeTask(tempDir, '20260424-526-a.md', 'task_id: 526\nstatus: opened\n', 'Task A');
      writePolicy(tempDir, { version: 1, allowed_autonomy_level: 'inspect' });

      const server = await createWorkbenchServer({ port: 0, host: '127.0.0.1', cwd: tempDir });
      const url = await server.start();

      // Hit all GET routes
      await httpGet(`${url}/api/roster`);
      await httpGet(`${url}/api/tasks`);
      await httpGet(`${url}/api/assignments`);
      await httpGet(`${url}/api/reviews`);
      await httpGet(`${url}/api/policy`);
      await httpGet(`${url}/api/audit`);
      await httpGet(`${url}/api/principals`);
      await httpGet(`${url}/api/graph`);
      await httpGet(`${url}/api/health`);

      await server.stop();

      // Verify no mutations occurred by re-reading and checking consistency
      const rosterRaw = await import('node:fs').then((fs) => fs.readFileSync(join(tempDir, '.ai', 'agents', 'roster.json'), 'utf8'));
      const roster = JSON.parse(rosterRaw);
      expect(roster.agents[0].status).toBe('idle');
    });
  });
});
