/**
 * Generic Webhook HTTP Server
 *
 * A minimal, domain-neutral webhook receiver that enqueues incoming
 * JSON payloads into a WebhookEventQueue. This makes the webhook
 * vertical a real peer of mailbox (Graph polling) and timer sources.
 */

import { createServer, type IncomingMessage, type ServerResponse, type Server } from "http";
import type { WebhookEventQueue } from "@narada2/exchange-fs-sync";
import { createLogger } from "./lib/logger.js";

export interface GenericWebhookServerConfig {
  port: number;
  host?: string;
  path?: string;
  maxBodySize?: number;
  verbose?: boolean;
}

export interface GenericWebhookServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
  getUrl(): string | null;
}

export function createGenericWebhookServer(
  config: GenericWebhookServerConfig,
  queue: WebhookEventQueue,
): GenericWebhookServer {
  const logger = createLogger({ component: "generic-webhook", verbose: config.verbose });
  let server: Server | null = null;
  let isRunning = false;
  let serverUrl: string | null = null;

  const host = config.host ?? "0.0.0.0";
  const port = config.port;
  const path = config.path ?? "/webhook";
  const maxBodySize = config.maxBodySize ?? 1024 * 1024;

  async function parseBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = "";
      let size = 0;

      req.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBodySize) {
          reject(new Error("Request body too large"));
          return;
        }
        body += chunk.toString("utf8");
      });

      req.on("end", () => resolve(body));
      req.on("error", reject);
    });
  }

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      if (req.method !== "POST") {
        res.writeHead(405, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Method not allowed" }));
        return;
      }

      const requestPath = new URL(req.url ?? "/", `http://${req.headers.host}`).pathname;
      if (requestPath !== path) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
        return;
      }

      let body: string;
      try {
        body = await parseBody(req);
      } catch (error) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Invalid body" }));
        return;
      }

      let payload: unknown;
      try {
        payload = JSON.parse(body);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
        return;
      }

      // Derive endpoint id from a header or default
      const endpointId = req.headers["x-webhook-endpoint"] ?? "default";
      const recordId = queue.enqueue(String(endpointId), payload);

      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ received: true, record_id: recordId }));

      logger.debug("Enqueued webhook event", { endpointId, recordId });
    } catch (error) {
      logger.error("Request handler error", error instanceof Error ? error : new Error(String(error)));
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    }
  }

  return {
    async start(): Promise<void> {
      if (server) {
        throw new Error("Server already started");
      }
      return new Promise((resolve, reject) => {
        server = createServer((req, res) => {
          handleRequest(req, res).catch((error) => {
            logger.error("Unhandled request error", error);
          });
        });

        server.on("error", (error) => {
          logger.error("Server error", error);
          reject(error);
        });

        server.listen(port, host, () => {
          isRunning = true;
          const address = server!.address();
          const actualPort = address && typeof address === "object" ? address.port : port;
          serverUrl = `http://${host === "0.0.0.0" ? "localhost" : host}:${actualPort}${path}`;
          logger.info("Generic webhook server started", { url: serverUrl });
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
          logger.info("Generic webhook server stopped");
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
