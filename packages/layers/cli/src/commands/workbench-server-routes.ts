/**
 * Workbench HTTP API routes.
 *
 * Read-only GET endpoints for workbench observation plus POST control
 * endpoints that delegate to existing governed operators.
 *
 * Authority boundary:
 * - GET routes are strictly read-only; they never mutate state.
 * - POST /api/control/* delegates through existing CLI command functions.
 * - No direct state mutation from route handlers.
 */

import type { ServerResponse, IncomingMessage } from 'http';
import { resolve, join } from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import {
  loadRoster,
  readTaskFile,
  parseFrontMatter,
  loadAssignment,
  extractTaskNumberFromFileName,
  type AgentRoster,
  type TaskFrontMatter,
  type TaskAssignmentRecord,
  type ReviewRecord,
} from '../lib/task-governance.js';
import { loadPolicy } from '../lib/construction-loop-policy.js';
import { readAllAuditLogs } from '../lib/construction-loop-audit.js';
import { buildPlan } from '../lib/construction-loop-plan.js';
import { generateRecommendations } from '../lib/task-recommender.js';
import { readTaskGraph, renderJson } from '../lib/task-graph.js';
import { openTaskLifecycleStore } from '../lib/task-lifecycle-store.js';
import {
  taskRosterAssignCommand,
  taskRosterDoneCommand,
  taskRosterIdleCommand,
} from './task-roster.js';
import {
  constructionLoopPauseCommand,
  constructionLoopResumeCommand,
} from './construction-loop.js';
import { taskRecommendCommand } from './task-recommend.js';
import { taskPromoteRecommendationCommand } from './task-promote-recommendation.js';
import {
  JsonPrincipalRuntimeRegistry,
  canClaimWork,
  canExecute,
} from '@narada2/control-plane';

export interface RouteHandler {
  method: string;
  pattern: RegExp;
  handler: (
    req: IncomingMessage,
    res: ServerResponse,
    params: RegExpExecArray,
    searchParams: URLSearchParams,
  ) => Promise<void>;
}

export interface WorkbenchRouteContext {
  cwd: string;
  verbose?: boolean;
}

function jsonResponse(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function parseLimit(searchParams: URLSearchParams, defaultValue = 50, max = 1000): number {
  const raw = searchParams.get('limit');
  if (!raw) return defaultValue;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return defaultValue;
  return Math.min(n, max);
}

function isLocalOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  return (
    origin.startsWith('http://localhost:') ||
    origin.startsWith('http://127.0.0.1:') ||
    origin.startsWith('https://localhost:') ||
    origin.startsWith('https://127.0.0.1:')
  );
}

function setCorsHeaders(res: ServerResponse, origin: string | undefined): boolean {
  if (!isLocalOrigin(origin)) {
    return false;
  }
  res.setHeader('Access-Control-Allow-Origin', origin ?? '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return true;
}

async function readBody(req: IncomingMessage, maxBytes = 65536): Promise<string> {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > maxBytes) {
      throw new Error('Payload too large');
    }
  }
  return body;
}

async function listAllTasks(cwd: string): Promise<
  Array<{
    task_id: string;
    task_number: number | null;
    status: string | undefined;
    title: string | undefined;
    depends_on: number[] | undefined;
  }>
> {
  const dir = join(cwd, '.ai', 'do-not-open', 'tasks');
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }

  const tasks: Array<{
    task_id: string;
    task_number: number | null;
    status: string | undefined;
    title: string | undefined;
    depends_on: number[] | undefined;
  }> = [];

  for (const f of files) {
    if (!f.endsWith('.md')) continue;
    const taskNumber = extractTaskNumberFromFileName(f);
    try {
      const content = await readFile(join(dir, f), 'utf8');
      const { frontMatter } = parseFrontMatter(content);
      tasks.push({
        task_id: f.replace(/\.md$/, ''),
        task_number: taskNumber,
        status: frontMatter.status as string | undefined,
        title: frontMatter.title as string | undefined,
        depends_on: frontMatter.depends_on as number[] | undefined,
      });
    } catch {
      // Skip malformed task files
    }
  }

  tasks.sort((a, b) => (b.task_number ?? 0) - (a.task_number ?? 0));
  return tasks;
}

async function listAllAssignments(cwd: string): Promise<TaskAssignmentRecord[]> {
  const store = openTaskLifecycleStore(cwd);
  try {
    const rows = store.db
      .prepare(`select record_json from task_assignment_records order by updated_at desc`)
      .all() as Array<{ record_json: string }>;
    const assignments: TaskAssignmentRecord[] = [];
    for (const row of rows) {
      try {
        assignments.push(JSON.parse(row.record_json) as TaskAssignmentRecord);
      } catch {
        // Skip malformed assignment records
      }
    }
    return assignments;
  } finally {
    try { store.db.close(); } catch { /* ignore */ }
  }
}

async function listAllReviews(cwd: string): Promise<ReviewRecord[]> {
  const dir = join(cwd, '.ai', 'reviews');
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }

  const reviews: ReviewRecord[] = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const raw = await readFile(join(dir, f), 'utf8');
      reviews.push(JSON.parse(raw) as ReviewRecord);
    } catch {
      // Skip malformed review files
    }
  }
  reviews.sort((a, b) => a.reviewed_at.localeCompare(b.reviewed_at));
  return reviews;
}

export function createWorkbenchRoutes(ctx: WorkbenchRouteContext): RouteHandler[] {
  return [
    // ── CORS preflight ──
    {
      method: 'OPTIONS',
      pattern: /^\/api\/.*$/,
      handler: async (_req, res) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          res.writeHead(403);
          res.end();
          return;
        }
        res.writeHead(204);
        res.end();
      },
    },

    // ── Roster ──
    {
      method: 'GET',
      pattern: /^\/api\/roster$/,
      handler: async (_req, res) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        try {
          const roster = await loadRoster(ctx.cwd);
          jsonResponse(res, 200, { roster });
        } catch (error) {
          const err = error instanceof Error ? error.message : String(error);
          jsonResponse(res, 500, { error: 'Failed to load roster', detail: err });
        }
      },
    },

    // ── Tasks ──
    {
      method: 'GET',
      pattern: /^\/api\/tasks$/,
      handler: async (_req, res, _params, searchParams) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const limit = parseLimit(searchParams, 100, 1000);
        try {
          const tasks = await listAllTasks(ctx.cwd);
          jsonResponse(res, 200, { tasks: tasks.slice(0, limit), total: tasks.length });
        } catch (error) {
          const err = error instanceof Error ? error.message : String(error);
          jsonResponse(res, 500, { error: 'Failed to list tasks', detail: err });
        }
      },
    },

    // ── Assignments ──
    {
      method: 'GET',
      pattern: /^\/api\/assignments$/,
      handler: async (_req, res) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        try {
          const assignments = await listAllAssignments(ctx.cwd);
          jsonResponse(res, 200, { assignments });
        } catch (error) {
          const err = error instanceof Error ? error.message : String(error);
          jsonResponse(res, 500, { error: 'Failed to list assignments', detail: err });
        }
      },
    },

    // ── Reviews ──
    {
      method: 'GET',
      pattern: /^\/api\/reviews$/,
      handler: async (_req, res, _params, searchParams) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const limit = parseLimit(searchParams, 100, 1000);
        try {
          const reviews = await listAllReviews(ctx.cwd);
          jsonResponse(res, 200, { reviews: reviews.slice(0, limit), total: reviews.length });
        } catch (error) {
          const err = error instanceof Error ? error.message : String(error);
          jsonResponse(res, 500, { error: 'Failed to list reviews', detail: err });
        }
      },
    },

    // ── Policy ──
    {
      method: 'GET',
      pattern: /^\/api\/policy$/,
      handler: async (_req, res) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        try {
          const { policy } = await loadPolicy(ctx.cwd);
          jsonResponse(res, 200, { policy });
        } catch (error) {
          const err = error instanceof Error ? error.message : String(error);
          jsonResponse(res, 500, { error: 'Failed to load policy', detail: err });
        }
      },
    },

    // ── Audit ──
    {
      method: 'GET',
      pattern: /^\/api\/audit$/,
      handler: async (_req, res, _params, searchParams) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const limit = parseLimit(searchParams, 100, 1000);
        try {
          const audit = await readAllAuditLogs(ctx.cwd);
          audit.sort((a: { timestamp: string }, b: { timestamp: string }) => b.timestamp.localeCompare(a.timestamp));
          jsonResponse(res, 200, { audit: audit.slice(0, limit), total: audit.length });
        } catch (error) {
          const err = error instanceof Error ? error.message : String(error);
          jsonResponse(res, 500, { error: 'Failed to read audit log', detail: err });
        }
      },
    },

    // ── Principals ──
    {
      method: 'GET',
      pattern: /^\/api\/principals$/,
      handler: async (_req, res) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        try {
          const registry = new JsonPrincipalRuntimeRegistry({ rootDir: ctx.cwd });
          await registry.init();
          const principals = registry.list().map((p) => ({
            runtime_id: p.runtime_id,
            principal_id: p.principal_id,
            principal_type: p.principal_type,
            state: p.state,
            scope_id: p.scope_id,
            attachment_mode: p.attachment_mode,
            can_claim_work: canClaimWork(p.state),
            can_execute: canExecute(p.state),
            state_changed_at: p.state_changed_at,
          }));
          await registry.flush();
          jsonResponse(res, 200, { principals });
        } catch (error) {
          const err = error instanceof Error ? error.message : String(error);
          jsonResponse(res, 500, { error: 'Failed to load principals', detail: err });
        }
      },
    },

    // ── Graph ──
    {
      method: 'GET',
      pattern: /^\/api\/graph$/,
      handler: async (_req, res) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        try {
          const graph = await readTaskGraph({ cwd: ctx.cwd, includeClosed: true });
          const jsonGraph = renderJson(graph);
          jsonResponse(res, 200, { nodes: jsonGraph.nodes, edges: jsonGraph.edges });
        } catch (error) {
          const err = error instanceof Error ? error.message : String(error);
          jsonResponse(res, 500, { error: 'Failed to read task graph', detail: err });
        }
      },
    },

    // ── Recommendations (on-demand) ──
    {
      method: 'GET',
      pattern: /^\/api\/recommendations$/,
      handler: async (_req, res, _params, searchParams) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        const limit = parseLimit(searchParams, 10, 100);
        const agent = searchParams.get('agent') ?? undefined;
        const task = searchParams.get('task') ?? undefined;
        try {
          const result = await taskRecommendCommand({
            agent,
            taskNumber: task,
            limit,
            cwd: ctx.cwd,
            format: 'json',
          });
          jsonResponse(res, result.exitCode === 0 ? 200 : 500, result.result);
        } catch (error) {
          const err = error instanceof Error ? error.message : String(error);
          jsonResponse(res, 500, { error: 'Failed to generate recommendations', detail: err });
        }
      },
    },

    // ── Plan (on-demand) ──
    {
      method: 'GET',
      pattern: /^\/api\/plan$/,
      handler: async (_req, res) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        try {
          const { policy } = await loadPolicy(ctx.cwd);
          const plan = await buildPlan({ cwd: ctx.cwd, policy });
          jsonResponse(res, 200, { plan });
        } catch (error) {
          const err = error instanceof Error ? error.message : String(error);
          jsonResponse(res, 500, { error: 'Failed to build plan', detail: err });
        }
      },
    },

    // ── Health ──
    {
      method: 'GET',
      pattern: /^\/api\/health$/,
      handler: async (_req, res) => {
        const origin = _req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        jsonResponse(res, 200, { status: 'ok', source: 'workbench', cwd: ctx.cwd });
      },
    },

    // ── Control: Assign ──
    {
      method: 'POST',
      pattern: /^\/api\/control\/assign$/,
      handler: async (req, res) => {
        const origin = req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        let body: string;
        try {
          body = await readBody(req);
        } catch {
          jsonResponse(res, 413, { error: 'Payload too large' });
          return;
        }
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(body) as Record<string, unknown>;
        } catch {
          jsonResponse(res, 400, { error: 'Invalid JSON' });
          return;
        }
        const agent = parsed.agent as string | undefined;
        const task = parsed.task as string | undefined;
        if (!agent || !task) {
          jsonResponse(res, 400, { error: 'Missing agent or task' });
          return;
        }
        const result = await taskRosterAssignCommand({
          agent,
          taskNumber: String(task),
          cwd: ctx.cwd,
          format: 'json',
        });
        jsonResponse(res, result.exitCode === 0 ? 200 : 422, result.result);
      },
    },

    // ── Control: Done ──
    {
      method: 'POST',
      pattern: /^\/api\/control\/done$/,
      handler: async (req, res) => {
        const origin = req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        let body: string;
        try {
          body = await readBody(req);
        } catch {
          jsonResponse(res, 413, { error: 'Payload too large' });
          return;
        }
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(body) as Record<string, unknown>;
        } catch {
          jsonResponse(res, 400, { error: 'Invalid JSON' });
          return;
        }
        const agent = parsed.agent as string | undefined;
        const task = parsed.task as string | undefined;
        if (!agent || !task) {
          jsonResponse(res, 400, { error: 'Missing agent or task' });
          return;
        }
        const result = await taskRosterDoneCommand({
          agent,
          taskNumber: String(task),
          cwd: ctx.cwd,
          format: 'json',
          allowIncomplete: parsed.allow_incomplete as boolean | undefined,
        });
        jsonResponse(res, result.exitCode === 0 ? 200 : 422, result.result);
      },
    },

    // ── Control: Idle ──
    {
      method: 'POST',
      pattern: /^\/api\/control\/idle$/,
      handler: async (req, res) => {
        const origin = req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        let body: string;
        try {
          body = await readBody(req);
        } catch {
          jsonResponse(res, 413, { error: 'Payload too large' });
          return;
        }
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(body) as Record<string, unknown>;
        } catch {
          jsonResponse(res, 400, { error: 'Invalid JSON' });
          return;
        }
        const agent = parsed.agent as string | undefined;
        if (!agent) {
          jsonResponse(res, 400, { error: 'Missing agent' });
          return;
        }
        const result = await taskRosterIdleCommand({
          agent,
          cwd: ctx.cwd,
          format: 'json',
        });
        jsonResponse(res, result.exitCode === 0 ? 200 : 422, result.result);
      },
    },

    // ── Control: Promote ──
    {
      method: 'POST',
      pattern: /^\/api\/control\/promote$/,
      handler: async (req, res) => {
        const origin = req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        let body: string;
        try {
          body = await readBody(req);
        } catch {
          jsonResponse(res, 413, { error: 'Payload too large' });
          return;
        }
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(body) as Record<string, unknown>;
        } catch {
          jsonResponse(res, 400, { error: 'Invalid JSON' });
          return;
        }
        const task = parsed.task as string | undefined;
        const agent = parsed.agent as string | undefined;
        const by = parsed.by as string | undefined;
        if (!task || !agent || !by) {
          jsonResponse(res, 400, { error: 'Missing task, agent, or by' });
          return;
        }
        const result = await taskPromoteRecommendationCommand({
          taskNumber: String(task),
          agent,
          by,
          dryRun: parsed.dry_run as boolean | undefined,
          overrideRisk: parsed.override_risk as string | undefined,
          cwd: ctx.cwd,
          format: 'json',
        });
        jsonResponse(res, result.exitCode === 0 ? 200 : 422, result.result);
      },
    },

    // ── Control: Pause ──
    {
      method: 'POST',
      pattern: /^\/api\/control\/pause$/,
      handler: async (req, res) => {
        const origin = req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        let body: string;
        try {
          body = await readBody(req);
        } catch {
          jsonResponse(res, 413, { error: 'Payload too large' });
          return;
        }
        let parsed: Record<string, unknown> = {};
        if (body.trim().length > 0) {
          try {
            parsed = JSON.parse(body) as Record<string, unknown>;
          } catch {
            jsonResponse(res, 400, { error: 'Invalid JSON' });
            return;
          }
        }
        const result = await constructionLoopPauseCommand({
          reason: parsed.reason as string | undefined,
          cwd: ctx.cwd,
          format: 'json',
        });
        jsonResponse(res, result.exitCode === 0 ? 200 : 422, result.result);
      },
    },

    // ── Control: Resume ──
    {
      method: 'POST',
      pattern: /^\/api\/control\/resume$/,
      handler: async (req, res) => {
        const origin = req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        let body: string;
        try {
          body = await readBody(req);
        } catch {
          jsonResponse(res, 413, { error: 'Payload too large' });
          return;
        }
        if (body.trim().length > 0) {
          try {
            JSON.parse(body);
          } catch {
            jsonResponse(res, 400, { error: 'Invalid JSON' });
            return;
          }
        }
        const result = await constructionLoopResumeCommand({
          cwd: ctx.cwd,
          format: 'json',
        });
        jsonResponse(res, result.exitCode === 0 ? 200 : 422, result.result);
      },
    },

    // ── Control: Recommend ──
    {
      method: 'POST',
      pattern: /^\/api\/control\/recommend$/,
      handler: async (req, res) => {
        const origin = req.headers.origin;
        if (!setCorsHeaders(res, origin)) {
          jsonResponse(res, 403, { error: 'Origin not allowed' });
          return;
        }
        let body: string;
        try {
          body = await readBody(req);
        } catch {
          jsonResponse(res, 413, { error: 'Payload too large' });
          return;
        }
        let parsed: Record<string, unknown> = {};
        if (body.trim().length > 0) {
          try {
            parsed = JSON.parse(body) as Record<string, unknown>;
          } catch {
            jsonResponse(res, 400, { error: 'Invalid JSON' });
            return;
          }
        }
        const result = await taskRecommendCommand({
          agent: parsed.agent as string | undefined,
          taskNumber: parsed.task as string | undefined,
          limit: parsed.limit ? Number(parsed.limit) : undefined,
          cwd: ctx.cwd,
          format: 'json',
        });
        jsonResponse(res, result.exitCode === 0 ? 200 : 422, result.result);
      },
    },
  ];
}
