/**
 * Operator Console HTTP Server
 *
 * HTTP server for browser UI consumption of cross-Site observation
 * and audited control routing.
 *
 * Uses the same Site Registry, adapter selection, and ControlRequestRouter
 * boundaries as the CLI `narada console` commands.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http';
import { openRegistry, createObservationFactory, createControlClientFactory } from '../lib/console-core.js';
import { createConsoleServerRoutes } from './console-server-routes.js';
import { createSiteRegistryReadModel, type SiteRegistryReadModel } from './site-registry-read-model.js';
import { createRegistryMutationGateway, type RegistryMutationGateway } from './site-registry-management-gateway.js';
import { renderOperatorWorkspacePage } from './operator-workspace-page.js';
import type { WorkspaceLaunchUiSessionRecord } from './workspace-launch-session-store.js';

export interface ConsoleServerConfig {
  port: number;
  host?: string;
  ingressMode?: 'diagnostic' | 'router';
  registryReadModel?: SiteRegistryReadModel;
  registryMutationGateway?: RegistryMutationGateway;
  workspaceLaunchSessions?: () => Promise<WorkspaceLaunchUiSessionRecord[]>;
}

export interface ConsoleServer {
  start(): Promise<string>;
  stop(): Promise<void>;
  isRunning(): boolean;
  getUrl(): string | null;
}

export async function createConsoleServer(config: ConsoleServerConfig): Promise<ConsoleServer> {
  const host = config.host ?? '127.0.0.1';
  const port = config.port;
  const registry = await openRegistry();

  const observationFactory = createObservationFactory();
  const controlClientFactory = createControlClientFactory(registry);

  const routeContext = {
    registry,
    observationFactory,
    controlClientFactory,
    registryReadModel: config.registryReadModel ?? createSiteRegistryReadModel(),
    registryMutationGateway: config.registryMutationGateway ?? createRegistryMutationGateway(),
    workspaceLaunchSessions: config.workspaceLaunchSessions,
  };

  const routes = createConsoleServerRoutes(routeContext);
  const siteRegistryAvailable = routes.some((route) => route.method === 'GET' && route.pattern.test('/console/registry'));

  let server: Server | null = null;
  let isRunning = false;
  let serverUrl: string | null = null;

  function jsonResponse(res: ServerResponse, status: number, payload: unknown): void {
    const body = JSON.stringify(payload);
    res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
  }

  function htmlResponse(res: ServerResponse, status: number, body: string): void {
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
  }

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
      const pathname = url.pathname;

      if (pathname === '/') {
        htmlResponse(res, 200, renderOperatorWorkspacePage({
          ingressMode: config.ingressMode ?? 'diagnostic',
          siteRegistryAvailable,
        }));
        return;
      }

      for (const route of routes) {
        const match = route.pattern.exec(pathname);
        if (match && req.method === route.method) {
          await route.handler(req, res, match, url.searchParams);
          return;
        }
      }

      // Namespace separation: observation paths are GET-only, control is POST-only
      const isControlPath = pathname.startsWith('/console/sites/') && pathname.endsWith('/control');
      const isObservationPath = pathname.startsWith('/console/') && !isControlPath;

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
        throw new Error('Console server already started');
      }
      try {
        return await new Promise((resolve, reject) => {
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
      } catch (error) {
        const failedServer = server as unknown as Server | null;
        server = null;
        if (failedServer?.listening) {
          await new Promise<void>((resolve) => failedServer.close(() => resolve()));
        }
        throw error;
      }
    },

    async stop(): Promise<void> {
      registry.close();
      if (server) {
        await new Promise<void>((resolve) => {
          server!.close(() => {
            isRunning = false;
            serverUrl = null;
            server = null;
            resolve();
          });
        });
      }
    },

    isRunning(): boolean {
      return isRunning;
    },

    getUrl(): string | null {
      return serverUrl;
    },
  };
}
