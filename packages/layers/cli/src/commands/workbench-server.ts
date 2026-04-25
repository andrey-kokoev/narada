/**
 * Workbench HTTP Server
 *
 * Thin localhost-only HTTP adapter that exposes existing governed read
 * and mutation surfaces to the browser workbench without inventing new
 * authority.
 *
 * Authority boundary:
 * - GET routes are strictly read-only; they reuse existing CLI helpers.
 * - POST /api/control/* routes delegate to existing governed operators.
 * - No direct mutation from route handlers.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http';
import { resolve, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { createWorkbenchRoutes, type RouteHandler } from './workbench-server-routes.js';
import { fileURLToPath } from 'node:url';
import { ExitCode } from '../lib/exit-codes.js';
import { readTaskGraph } from '../lib/task-graph.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export interface WorkbenchServerConfig {
  port: number;
  host?: string;
  cwd?: string;
  verbose?: boolean;
}

export interface WorkbenchServer {
  start(): Promise<string>;
  stop(): Promise<void>;
  isRunning(): boolean;
  getUrl(): string | null;
}

export interface WorkbenchDiagnoseOptions {
  cwd?: string;
  format?: 'json' | 'human' | 'auto';
}

export async function workbenchDiagnoseCommand(
  options: WorkbenchDiagnoseOptions,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const graph = await readTaskGraph({ cwd, includeClosed: true });
  const routeCount = createWorkbenchRoutes({ cwd }).length;
  const result = {
    status: 'ok',
    source: 'workbench',
    cwd,
    routes: {
      count: routeCount,
      health: '/api/health',
      graph: '/api/graph',
      recommendations: '/api/recommendations',
    },
    graph: {
      nodes: graph.nodes.length,
      edges: graph.edges.length,
    },
  };
  if (options.format === 'json') {
    return { exitCode: ExitCode.SUCCESS, result };
  }
  return {
    exitCode: ExitCode.SUCCESS,
    result: `Workbench ok: ${graph.nodes.length} graph nodes, ${graph.edges.length} edges, ${routeCount} routes`,
  };
}

export async function createWorkbenchServer(config: WorkbenchServerConfig): Promise<WorkbenchServer> {
  const host = config.host ?? '127.0.0.1';
  const port = config.port;
  const cwd = config.cwd ? resolve(config.cwd) : process.cwd();

  const routeContext = { cwd, verbose: !!config.verbose };
  const apiRoutes = createWorkbenchRoutes(routeContext);

  function loadWorkbenchHtml(): string {
    const candidates = [
      join(__dirname, '..', 'ui', 'workbench.html'),
      join(cwd, 'packages', 'layers', 'cli', 'src', 'ui', 'workbench.html'),
      join(cwd, 'packages', 'layers', 'cli', 'dist', 'ui', 'workbench.html'),
    ];

    for (const path of candidates) {
      if (existsSync(path)) {
        return readFileSync(path, 'utf8');
      }
    }

    return '<!DOCTYPE html><html><body><h1>Narada Workbench</h1><p>UI not found.</p></body></html>';
  }

  // Load workbench UI HTML (served at root)
  const uiHtml = loadWorkbenchHtml();

  const routes: RouteHandler[] = [
    {
      method: 'GET',
      pattern: /^\/$/,
      handler: async (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Length': Buffer.byteLength(uiHtml) });
        res.end(uiHtml);
      },
    },
    ...apiRoutes,
  ];

  let server: Server | null = null;
  let isRunning = false;
  let serverUrl: string | null = null;

  function jsonResponse(res: ServerResponse, status: number, payload: unknown): void {
    const body = JSON.stringify(payload);
    res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
  }

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
      const pathname = url.pathname;

      for (const route of routes) {
        const match = route.pattern.exec(pathname);
        if (match && req.method === route.method) {
          await route.handler(req, res, match, url.searchParams);
          return;
        }
      }

      // Namespace separation: observation paths are GET-only, control is POST-only
      const isControlPath = pathname.startsWith('/api/control/');
      const isObservationPath = pathname.startsWith('/api/') && !isControlPath;

      if (isObservationPath && req.method !== 'GET' && req.method !== 'OPTIONS') {
        jsonResponse(res, 405, { error: 'Method not allowed' });
        return;
      }

      if (isControlPath && req.method !== 'POST' && req.method !== 'OPTIONS') {
        jsonResponse(res, 405, { error: 'Method not allowed' });
        return;
      }

      jsonResponse(res, 404, { error: 'Not found' });
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      if (!res.headersSent) {
        jsonResponse(res, 500, { error: 'Internal server error', detail: err });
      }
    }
  }

  return {
    async start(): Promise<string> {
      if (server) {
        throw new Error('Workbench server already started');
      }
      return new Promise((resolve, reject) => {
        server = createServer((req, res) => {
          handleRequest(req, res).catch(() => {
            if (!res.headersSent) {
              jsonResponse(res, 500, { error: 'Internal server error' });
            }
          });
        });

        server.on('error', (error) => {
          reject(error);
        });

        server.listen(port, host, () => {
          isRunning = true;
          const address = server!.address();
          const actualPort = typeof address === 'object' && address !== null ? address.port : port;
          serverUrl = `http://${host === '0.0.0.0' ? 'localhost' : host}:${actualPort}`;
          resolve(serverUrl);
        });
      });
    },

    async stop(): Promise<void> {
      return new Promise((resolve) => {
        if (!server) {
          resolve();
          return;
        }
        server.close(() => {
          isRunning = false;
          serverUrl = null;
          server = null;
          resolve();
        });
      });
    },

    isRunning(): boolean {
      return isRunning;
    },

    getUrl(): string | null {
      return serverUrl;
    },
  };
}
