/**
 * Webhook HTTP server for receiving Microsoft Graph notifications
 * 
 * Handles:
 * - Subscription validation (echo back validation token)
 * - Change notifications (created/updated/deleted)
 * - Lifecycle notifications (renewal required, missed, etc.)
 * - Signature validation and client state verification
 */

import { createServer, type IncomingMessage, type ServerResponse, type Server } from "http";
import type { GraphNotification } from "@narada2/control-plane";
import {
  extractValidationToken,
  extractSignature,
  validateWebhookSignature,
  validateNotification,
  sanitizeNotificationForLogging,
  WebhookRateLimiter,
  type WebhookValidationConfig,
  type DetailedValidationResult,
} from "./webhook-validation.js";
import { createLogger } from "./lib/logger.js";

/**
 * Webhook server configuration
 */
export interface WebhookServerConfig {
  /** Port to listen on */
  port: number;
  
  /** Host to bind to (default: 0.0.0.0) */
  host?: string;
  
  /** Path for webhook endpoint (default: /webhook) */
  path?: string;
  
  /** Validation configuration */
  validation: WebhookValidationConfig;
  
  /** Enable signature validation (requires hmacSecret) */
  validateSignatures?: boolean;
  
  /** Request timeout in ms (default: 30000) */
  requestTimeoutMs?: number;
  
  /** Maximum body size in bytes (default: 1MB) */
  maxBodySize?: number;
  
  /** Rate limiting: max requests per window (default: 100) */
  rateLimitMaxRequests?: number;
  
  /** Rate limiting: window size in ms (default: 60000) */
  rateLimitWindowMs?: number;
  
  /** Verbose logging */
  verbose?: boolean;
}

/**
 * Parsed notification with metadata
 */
export interface ParsedNotification {
  /** The notification payload */
  notification: GraphNotification;
  
  /** Raw request body */
  rawBody: string;
  
  /** Signature from Authorization header */
  signature: string | null;
  
  /** Validation result */
  validation: DetailedValidationResult;
}

/**
 * Webhook server lifecycle callbacks
 */
export interface WebhookCallbacks {
  /** Called when a change notification is received */
  onNotification: (notification: ParsedNotification) => void | Promise<void>;
  
  /** Called when a lifecycle notification is received */
  onLifecycle?: (notification: ParsedNotification) => void | Promise<void>;
  
  /** Called when validation fails */
  onValidationFailure?: (
    notification: GraphNotification,
    error: string
  ) => void | Promise<void>;
  
  /** Called when server starts */
  onStart?: () => void;
  
  /** Called when server stops */
  onStop?: () => void;
  
  /** Called on server error */
  onError?: (error: Error) => void;
}

/**
 * Webhook server interface
 */
export interface WebhookServer {
  /** Start the server */
  start(): Promise<void>;
  
  /** Stop the server */
  stop(): Promise<void>;
  
  /** Check if server is running */
  isRunning(): boolean;
  
  /** Get server URL */
  getUrl(): string | null;
}

/**
 * Create a webhook server for receiving Graph notifications
 */
export function createWebhookServer(
  config: WebhookServerConfig,
  callbacks: WebhookCallbacks
): WebhookServer {
  const logger = createLogger({ component: "webhook", verbose: config.verbose });
  const rateLimiter = new WebhookRateLimiter(
    config.rateLimitWindowMs ?? 60000,
    config.rateLimitMaxRequests ?? 100
  );
  
  let server: Server | null = null;
  let isRunning = false;
  let serverUrl: string | null = null;

  const host = config.host ?? "0.0.0.0";
  const port = config.port;
  const path = config.path ?? "/webhook";
  const maxBodySize = config.maxBodySize ?? 1024 * 1024; // 1MB
  const requestTimeoutMs = config.requestTimeoutMs ?? 30000;

  /**
   * Parse JSON body from request
   */
  async function parseBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = "";
      let size = 0;
      
      req.setTimeout(requestTimeoutMs, () => {
        reject(new Error("Request timeout"));
      });
      
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

  /**
   * Handle subscription validation request
   * 
   * Graph sends: POST /webhook?validationToken={token}
   * We respond: 200 OK with {token} in body (Content-Type: text/plain)
   */
  async function handleValidation(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<boolean> {
    const validationToken = extractValidationToken(req.url ?? "");
    
    if (!validationToken) {
      return false;
    }
    
    logger.debug("Handling subscription validation", {
      token: validationToken.slice(0, 10) + "...",
    });
    
    // Respond with the validation token
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(validationToken);
    
    return true;
  }

  /**
   * Parse and validate notifications from request body
   */
  async function parseNotifications(
    body: string,
    signature: string | null
  ): Promise<ParsedNotification[]> {
    let data: unknown;
    
    try {
      data = JSON.parse(body);
    } catch (error) {
      throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Graph sends notifications in a "value" array
    const notifications = (data as { value?: unknown[] }).value;
    
    if (!Array.isArray(notifications)) {
      throw new Error("Invalid notification format: expected value array");
    }
    
    const results: ParsedNotification[] = [];
    
    for (const notification of notifications) {
      if (!notification || typeof notification !== "object") {
        continue;
      }
      
      const validation = validateNotification(
        notification as Record<string, unknown>,
        config.validation
      );
      
      // Validate signature if enabled and provided
      if (config.validateSignatures && signature && config.validation.hmacSecret) {
        const validSignature = validateWebhookSignature(
          body,
          signature,
          config.validation.hmacSecret
        );
        
        if (!validSignature) {
          validation.valid = false;
          validation.error = "Invalid signature";
        }
      }
      
      results.push({
        notification: notification as GraphNotification,
        rawBody: body,
        signature,
        validation,
      });
    }
    
    return results;
  }

  /**
   * Handle notification request
   */
  async function handleNotification(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const clientId = req.socket.remoteAddress ?? "unknown";
    
    // Check rate limit
    if (!rateLimiter.isAllowed(clientId)) {
      logger.warn("Rate limit exceeded", { clientId });
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Rate limit exceeded" }));
      return;
    }
    
    let body: string;
    try {
      body = await parseBody(req);
    } catch (error) {
      logger.warn("Failed to parse request body", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid request body" }));
      return;
    }
    
    // Extract signature from Authorization header
    const authHeader = req.headers.authorization;
    const signature = extractSignature(authHeader);
    
    // Parse and validate notifications
    let notifications: ParsedNotification[];
    try {
      notifications = await parseNotifications(body, signature);
    } catch (error) {
      logger.warn("Failed to parse notifications", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid notification format" }));
      return;
    }
    
    // Acknowledge receipt immediately
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ received: notifications.length }));
    
    // Process notifications asynchronously
    for (const parsed of notifications) {
      processNotification(parsed).catch((error) => {
        logger.error("Failed to process notification", error);
      });
    }
  }

  /**
   * Process a single notification
   */
  async function processNotification(parsed: ParsedNotification): Promise<void> {
    const { notification, validation } = parsed;
    
    // Log sanitized notification
    const sanitized = sanitizeNotificationForLogging(notification);
    
    if (!validation.valid) {
      logger.warn("Notification validation failed", {
        error: validation.error,
        notification: sanitized,
      });
      
      if (callbacks.onValidationFailure) {
        await callbacks.onValidationFailure(notification, validation.error ?? "Unknown error");
      }
      return;
    }
    
    logger.debug("Processing notification", {
      subscriptionId: (notification as { subscriptionId?: string }).subscriptionId,
      type: "lifecycleEvent" in notification ? "lifecycle" : "change",
    });
    
    // Check if this is a lifecycle notification
    if ("lifecycleEvent" in notification) {
      if (callbacks.onLifecycle) {
        await callbacks.onLifecycle(parsed);
      } else {
        // Default: treat lifecycle notifications as regular notifications
        await callbacks.onNotification(parsed);
      }
    } else {
      await callbacks.onNotification(parsed);
    }
  }

  /**
   * Main request handler
   */
  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      // Only accept POST requests
      if (req.method !== "POST") {
        res.writeHead(405, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Method not allowed" }));
        return;
      }
      
      // Check path
      const requestPath = new URL(req.url ?? "/", `http://${req.headers.host}`).pathname;
      if (requestPath !== path) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
        return;
      }
      
      // Handle validation request (subscription creation)
      if (await handleValidation(req, res)) {
        return;
      }
      
      // Handle notification
      await handleNotification(req, res);
    } catch (error) {
      logger.error("Request handler error", error instanceof Error ? error : new Error(String(error)));
      
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
      
      callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
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
          callbacks.onError?.(error);
          reject(error);
        });
        
        server.listen(port, host, () => {
          isRunning = true;
          serverUrl = `http://${host === "0.0.0.0" ? "localhost" : host}:${port}${path}`;
          logger.info("Webhook server started", {
            url: serverUrl,
            port,
            host,
            path,
          });
          callbacks.onStart?.();
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
          logger.info("Webhook server stopped");
          callbacks.onStop?.();
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

/**
 * Create a simple webhook server with default handlers
 */
export function createSimpleWebhookServer(
  config: WebhookServerConfig,
  onNotification: (notification: GraphNotification) => void | Promise<void>
): WebhookServer {
  return createWebhookServer(config, {
    onNotification: (parsed) => onNotification(parsed.notification),
  });
}
