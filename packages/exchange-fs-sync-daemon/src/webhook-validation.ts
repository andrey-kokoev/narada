/**
 * Webhook validation and security utilities
 * 
 * Microsoft Graph webhooks use validation tokens and optional
 * signature validation for security.
 */

import { createHmac, timingSafeEqual } from "crypto";

/**
 * Configuration for webhook validation
 */
export interface WebhookValidationConfig {
  /** Client state secret for validation */
  clientState: string;
  
  /** Optional HMAC secret for signature validation */
  hmacSecret?: string;
  
  /** Allowed tenant IDs (empty = allow all) */
  allowedTenantIds?: string[];
}

/**
 * Result of validating a subscription creation request
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate the subscription creation validation token
 * 
 * Graph sends a validationToken query parameter when creating
 * a subscription. We must echo it back in the response body.
 */
export function extractValidationToken(url: string): string | null {
  try {
    const parsedUrl = new URL(url, "http://localhost");
    return parsedUrl.searchParams.get("validationToken");
  } catch {
    return null;
  }
}

/**
 * Validate webhook signature using HMAC-SHA256
 * 
 * When resource data is included, Graph can sign notifications
 * with an HMAC signature in the Authorization header.
 */
export function validateWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  try {
    const expected = createHmac("sha256", secret)
      .update(payload)
      .digest("base64");
    
    const expectedBuf = Buffer.from(expected);
    const signatureBuf = Buffer.from(signature);
    
    // Use timing-safe comparison to prevent timing attacks
    if (expectedBuf.length !== signatureBuf.length) {
      return false;
    }
    
    return timingSafeEqual(expectedBuf, signatureBuf);
  } catch {
    return false;
  }
}

/**
 * Extract signature from Authorization header
 * 
 * Graph sends: Authorization: Bearer {signature}
 */
export function extractSignature(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }
  
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

/**
 * Validate client state matches expected value
 * 
 * Client state is set during subscription creation and returned
 * in each notification to verify the notification is legitimate.
 */
export function validateClientState(
  received: string | null | undefined,
  expected: string
): boolean {
  if (!expected) {
    // No expected state configured, skip validation
    return true;
  }
  
  if (!received) {
    return false;
  }
  
  // Use timing-safe comparison
  const receivedBuf = Buffer.from(received);
  const expectedBuf = Buffer.from(expected);
  
  if (receivedBuf.length !== expectedBuf.length) {
    return false;
  }
  
  return timingSafeEqual(receivedBuf, expectedBuf);
}

/**
 * Check if tenant ID is in the allowed list
 */
export function isAllowedTenant(
  tenantId: string | null | undefined,
  allowedTenantIds: string[]
): boolean {
  if (!allowedTenantIds || allowedTenantIds.length === 0) {
    return true; // No restrictions
  }
  
  if (!tenantId) {
    return false;
  }
  
  return allowedTenantIds.includes(tenantId);
}

/**
 * Sanitize notification payload for logging (remove sensitive data)
 */
export function sanitizeNotificationForLogging(
  notification: unknown
): Record<string, unknown> {
  if (!notification || typeof notification !== "object") {
    return { error: "Invalid notification" };
  }
  
  const sanitized: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(notification)) {
    // Redact sensitive fields
    if (["clientState", "encryptionKey"].includes(key)) {
      sanitized[key] = value ? "[REDACTED]" : null;
    } else if (key === "resourceData" && value && typeof value === "object") {
      // Keep resource data structure but sanitize any sensitive fields
      sanitized[key] = sanitizeResourceData(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * Sanitize resource data for logging
 */
function sanitizeResourceData(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(data)) {
    // Redact potentially sensitive fields in resource data
    if (["body", "bodyPreview", "uniqueBody", "internetMessageHeaders"].includes(key)) {
      sanitized[key] = value ? "[REDACTED]" : null;
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * Generate a secure random client state
 * 
 * Client state should be unpredictable to prevent notification spoofing.
 */
export function generateClientState(length = 32): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return result;
}

/**
 * Webhook validation error types
 */
export enum WebhookValidationError {
  MISSING_CLIENT_STATE = "missing_client_state",
  INVALID_CLIENT_STATE = "invalid_client_state",
  INVALID_SIGNATURE = "invalid_signature",
  INVALID_TENANT = "invalid_tenant",
  MISSING_SUBSCRIPTION_ID = "missing_subscription_id",
  INVALID_CHANGE_TYPE = "invalid_change_type",
}

/**
 * Detailed validation result with error code
 */
export interface DetailedValidationResult {
  valid: boolean;
  errorCode?: WebhookValidationError;
  error?: string;
}

/**
 * Validate a notification payload
 */
export function validateNotification(
  notification: Record<string, unknown>,
  config: WebhookValidationConfig
): DetailedValidationResult {
  // Check subscription ID
  if (!notification.subscriptionId) {
    return {
      valid: false,
      errorCode: WebhookValidationError.MISSING_SUBSCRIPTION_ID,
      error: "Missing subscriptionId in notification",
    };
  }
  
  // Validate client state
  const clientState = notification.clientState as string | null | undefined;
  if (!validateClientState(clientState, config.clientState)) {
    return {
      valid: false,
      errorCode: WebhookValidationError.INVALID_CLIENT_STATE,
      error: "Invalid or missing client state",
    };
  }
  
  // Validate tenant if restrictions are configured
  const tenantId = notification.tenantId as string | undefined;
  if (config.allowedTenantIds && config.allowedTenantIds.length > 0) {
    if (!isAllowedTenant(tenantId, config.allowedTenantIds)) {
      return {
        valid: false,
        errorCode: WebhookValidationError.INVALID_TENANT,
        error: `Tenant ${tenantId} is not in allowed list`,
      };
    }
  }
  
  // Validate change type for change notifications
  if ("changeType" in notification) {
    const validChangeTypes = ["created", "updated", "deleted"];
    const changeType = notification.changeType as string;
    if (!validChangeTypes.includes(changeType)) {
      return {
        valid: false,
        errorCode: WebhookValidationError.INVALID_CHANGE_TYPE,
        error: `Invalid change type: ${changeType}`,
      };
    }
  }
  
  return { valid: true };
}

/**
 * Rate limit tracking for webhook endpoints
 */
export class WebhookRateLimiter {
  private requests = new Map<string, number[]>();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(windowMs = 60000, maxRequests = 100) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  /**
   * Check if request is allowed and record it
   */
  isAllowed(clientId: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    // Get existing requests for this client
    let clientRequests = this.requests.get(clientId) || [];
    
    // Remove old requests outside the window
    clientRequests = clientRequests.filter(timestamp => timestamp > windowStart);
    
    // Check if under limit
    if (clientRequests.length >= this.maxRequests) {
      this.requests.set(clientId, clientRequests);
      return false;
    }
    
    // Record this request
    clientRequests.push(now);
    this.requests.set(clientId, clientRequests);
    
    return true;
  }

  /**
   * Get current request count for a client
   */
  getRequestCount(clientId: string): number {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    const clientRequests = this.requests.get(clientId) || [];
    return clientRequests.filter(timestamp => timestamp > windowStart).length;
  }

  /**
   * Reset rate limit for a client
   */
  reset(clientId: string): void {
    this.requests.delete(clientId);
  }

  /**
   * Clear all rate limit data
   */
  clear(): void {
    this.requests.clear();
  }
}
