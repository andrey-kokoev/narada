/**
 * Observation API Server
 *
 * HTTP server for UI consumption of the observation plane and safe operator actions.
 *
 * Architecture (Task 074/083):
 * - observation-routes.ts  -> all read-only GET endpoints under /scopes/...
 * - operator-action-routes.ts -> the single audited POST /control/scopes/.../actions endpoint
 * - observation-server.ts  -> server lifecycle, request dispatch, and shared types
 *
 * Authority boundary (Task 073/083):
 * - Observation namespace (/scopes/...) is strictly read-only GET.
 * - Control namespace (/control/...) is the only permitted write surface.
 * - All write paths are validated, audited, and delegated to operator-actions.ts.
 * - ObservationApiScope exposes only *View / *OperatorView store interfaces.
 *   Future contributors cannot call hidden store mutations from route handlers.
 * - Reconstructible from SQLite stores alone.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type CoordinatorStoreOperatorView,
  type OutboundStoreView,
  type IntentStoreView,
  type ProcessExecutionStoreView,
  type FactStoreView,
  type WorkerRegistryView,
} from "@narada2/exchange-fs-sync";
import { createLogger } from "./lib/logger.js";
import { createObservationRoutes } from "./observation-routes.js";
import { createOperatorActionRoutes } from "./operator-action-routes.js";
import type { RouteHandler } from "./routes.js";

export interface ObservationServerConfig {
  port: number;
  host?: string;
  /** Optional path prefix (default: empty) */
  pathPrefix?: string;
  verbose?: boolean;
}

export interface ObservationApiScope {
  scope_id: string;
  coordinatorStore: CoordinatorStoreOperatorView;
  outboundStore: OutboundStoreView;
  intentStore: IntentStoreView;
  executionStore: ProcessExecutionStoreView;
  workerRegistry: WorkerRegistryView;
  factStore: FactStoreView;
  /** Optional callback to rebuild filesystem views (scope-specific) */
  rebuildViews?: () => Promise<void>;
  /** Optional callback to trigger a dispatch phase for this scope */
  runDispatchPhase?: () => Promise<void>;
}

export interface ObservationServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
  getUrl(): string | null;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function jsonResponse(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

function htmlResponse(res: ServerResponse, body: string): void {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

export function createObservationServer(
  config: ObservationServerConfig,
  scopeApis: Map<string, ObservationApiScope>,
): ObservationServer {
  const logger = createLogger({ component: "observation", verbose: config.verbose });
  const host = config.host ?? "127.0.0.1";
  const port = config.port;
  const prefix = config.pathPrefix ?? "";

  let server: Server | null = null;
  let isRunning = false;
  let serverUrl: string | null = null;

  const uiHtml = readFileSync(join(__dirname, "ui", "index.html"), "utf8");

  const observationRoutes = createObservationRoutes(prefix, scopeApis);
  const operatorActionRoutes = createOperatorActionRoutes(prefix, scopeApis);

  const routes: RouteHandler[] = [
    {
      method: "GET",
      pattern: new RegExp(`^${prefix}/?$`),
      handler: async (_req, res) => {
        htmlResponse(res, uiHtml);
      },
    },
    ...observationRoutes,
    ...operatorActionRoutes,
  ];

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
      const pathname = url.pathname;

      for (const route of routes) {
        const match = route.pattern.exec(pathname);
        if (match && req.method === route.method) {
          await route.handler(req, res, match, url.searchParams);
          return;
        }
      }

      // Task 083 — explicit namespace separation
      const isControlPath = pathname.startsWith(`${prefix}/control/`);
      const isObservationPath = !isControlPath && pathname.startsWith(`${prefix}/scopes/`);

      if (isObservationPath && req.method !== "GET") {
        jsonResponse(res, 405, { error: "Method not allowed" });
        return;
      }

      if (isControlPath && req.method !== "POST") {
        jsonResponse(res, 405, { error: "Method not allowed" });
        return;
      }

      if (req.method !== "GET" && req.method !== "POST") {
        jsonResponse(res, 405, { error: "Method not allowed" });
        return;
      }

      jsonResponse(res, 404, { error: "Not found" });
    } catch (error) {
      logger.error("Observation request error", error instanceof Error ? error : new Error(String(error)));
      if (!res.headersSent) {
        jsonResponse(res, 500, { error: "Internal server error" });
      }
    }
  }

  return {
    async start(): Promise<void> {
      if (server) {
        throw new Error("Observation server already started");
      }
      return new Promise((resolve, reject) => {
        server = createServer((req, res) => {
          handleRequest(req, res).catch((error) => {
            logger.error("Unhandled observation request error", error);
          });
        });

        server.on("error", (error) => {
          logger.error("Observation server error", error);
          reject(error);
        });

        server.listen(port, host, () => {
          isRunning = true;
          const address = server!.address();
          const actualPort = typeof address === "object" && address !== null ? address.port : port;
          serverUrl = `http://${host === "0.0.0.0" ? "localhost" : host}:${actualPort}${prefix}`;
          logger.info("Observation server started", { url: serverUrl, port: actualPort, host });
          resolve();
        });
      });
    },

    async stop(): Promise<void> {
      if (!server) {
        return;
      }
      return new Promise((resolve) => {
        server?.close(() => {
          isRunning = false;
          serverUrl = null;
          server = null;
          logger.info("Observation server stopped");
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
