/**
 * Log sanitization utilities
 * Redacts sensitive information from log output
 */

/** Fields that should be redacted from logs */
const SENSITIVE_FIELDS = new Set([
  "client_secret",
  "access_token",
  "refresh_token",
  "password",
  "authorization",
  "token",
  "api_key",
  "apikey",
  "api-key",
  "secret",
  "private_key",
  "privatekey",
  "private-key",
  "credential",
  "credentials",
  "auth",
  "cookie",
  "session",
  "x-api-key",
]);

/** Patterns for detecting sensitive headers */
const SENSITIVE_HEADER_PATTERNS = [
  /^authorization$/i,
  /^x-api-key$/i,
  /^cookie$/i,
  /^x-auth-/i,
  /^x-session-/i,
];

/** Redacted value placeholder */
export const REDACTED = "***REDACTED***";

/**
 * Check if a key represents sensitive data
 */
export function isSensitiveField(key: string): boolean {
  const lowerKey = key.toLowerCase();
  if (SENSITIVE_FIELDS.has(lowerKey)) return true;

  // Check patterns
  for (const pattern of SENSITIVE_HEADER_PATTERNS) {
    if (pattern.test(key)) return true;
  }

  return false;
}

/**
 * Recursively sanitize an object for safe logging
 * Redacts sensitive fields while preserving structure
 */
export function sanitizeForLogging(obj: unknown, depth = 0): unknown {
  // Prevent excessive recursion
  if (depth > 10) {
    return "[Max depth exceeded]";
  }

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === "string") {
    // Check if the string itself looks like a secret
    if (looksLikeSecret(obj)) {
      return REDACTED;
    }
    return obj;
  }

  if (typeof obj === "number" || typeof obj === "boolean") {
    return obj;
  }

  if (typeof obj === "function") {
    return "[Function]";
  }

  if (obj instanceof Date) {
    return obj.toISOString();
  }

  if (obj instanceof Error) {
    return sanitizeError(obj);
  }

  if (obj instanceof Map) {
    const sanitized = new Map();
    for (const [key, value] of obj.entries()) {
      const keyStr = String(key);
      sanitized.set(
        isSensitiveField(keyStr) ? REDACTED : keyStr,
        isSensitiveField(keyStr) ? REDACTED : sanitizeForLogging(value, depth + 1),
      );
    }
    return Object.fromEntries(sanitized);
  }

  if (obj instanceof Set) {
    return Array.from(obj).map((item) => sanitizeForLogging(item, depth + 1));
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeForLogging(item, depth + 1));
  }

  if (typeof obj === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (isSensitiveField(key)) {
        sanitized[key] = REDACTED;
      } else {
        sanitized[key] = sanitizeForLogging(value, depth + 1);
      }
    }
    return sanitized;
  }

  // Unknown type - convert to string
  return String(obj);
}

/**
 * Check if a string looks like a secret/token
 */
function looksLikeSecret(value: string): boolean {
  if (value.length < 20) return false;

  // JWT pattern
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) {
    return true;
  }

  // Bearer token pattern
  if (/^Bearer\s+[A-Za-z0-9_-]{20,}$/i.test(value)) {
    return true;
  }

  // API key patterns
  if (/^(sk-|pk-|ak-)[A-Za-z0-9]{20,}$/.test(value)) {
    return true;
  }

  // Hex string (potential key)
  if (/^[a-f0-9]{32,}$/i.test(value)) {
    return true;
  }

  // Base64 looking string that's reasonably long
  if (/^[A-Za-z0-9+/]{40,}={0,2}$/.test(value) && isValidBase64(value)) {
    return true;
  }

  return false;
}

/**
 * Quick check for valid base64
 */
function isValidBase64(str: string): boolean {
  try {
    return btoa(atob(str)) === str;
  } catch {
    return false;
  }
}

/**
 * Sanitize an Error object for logging
 */
export function sanitizeError(error: Error): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {
    name: error.name,
    message: sanitizeErrorMessage(error.message),
  };

  if (error.stack) {
    sanitized.stack = sanitizeStackTrace(error.stack);
  }

  // Include additional properties
  for (const [key, value] of Object.entries(error)) {
    if (key !== "name" && key !== "message" && key !== "stack") {
      sanitized[key] = isSensitiveField(key) ? REDACTED : sanitizeForLogging(value);
    }
  }

  // Handle cause
  if (error.cause instanceof Error) {
    sanitized.cause = sanitizeError(error.cause);
  }

  return sanitized;
}

/**
 * Sanitize error message to remove sensitive data
 */
function sanitizeErrorMessage(message: string): string {
  // Redact URLs with credentials
  let sanitized = message.replace(
    /(https?:\/\/)[^@\s]+@([^\s]+)/gi,
    "$1***REDACTED***@$2",
  );

  // Redact tokens in error messages
  sanitized = sanitized.replace(
    /(token|key|secret|password)\s*[=:]\s*[^\s]+/gi,
    "$1=***REDACTED***",
  );

  return sanitized;
}

/**
 * Sanitize stack trace to remove file system details
 */
function sanitizeStackTrace(stack: string): string {
  return stack
    .split("\n")
    .map((line) => {
      // Keep the line but redact absolute paths
      return line.replace(
        /\s+at\s+(.+?)\s+\((.+?)\)/g,
        (_match, func, path) => {
          // Keep only the filename, not full path
          const filename = path.split("/").pop()?.split("\\").pop() ?? path;
          return `    at ${func} (${filename})`;
        },
      );
    })
    .join("\n");
}

/**
 * Redact an email address (partially)
 * Example: "john.doe@example.com" -> "jo***@example.com"
 */
export function redactEmail(email: string): string {
  const atIndex = email.indexOf("@");
  if (atIndex === -1) return email;

  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);

  if (local.length <= 2) {
    return `***@${domain}`;
  }

  const visible = local.slice(0, 2);
  return `${visible}***@${domain}`;
}

/**
 * Sanitize HTTP headers for logging
 */
export function sanitizeHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string | string[]> {
  const sanitized: Record<string, string | string[]> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (isSensitiveField(key)) {
      const val = Array.isArray(value) ? value[0] : value;
      const length = val?.length ?? 0;
      sanitized[key] = `[REDACTED:${length}chars]`;
    } else if (value !== undefined) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Sanitize a URL, removing query parameters that may contain secrets
 */
export function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);

    // List of sensitive query parameters
    const sensitiveParams = [
      "token",
      "api_key",
      "apikey",
      "key",
      "secret",
      "password",
      "auth",
      "code",
    ];

    let sanitized = false;
    for (const param of sensitiveParams) {
      if (parsed.searchParams.has(param)) {
        parsed.searchParams.set(param, REDACTED);
        sanitized = true;
      }
    }

    // Remove credentials from URL
    if (parsed.username || parsed.password) {
      parsed.username = "";
      parsed.password = "";
      sanitized = true;
    }

    return sanitized ? parsed.toString() : url;
  } catch {
    // Invalid URL - return as-is or redact if looks suspicious
    if (url.length > 100 && looksLikeSecret(url)) {
      return REDACTED;
    }
    return url;
  }
}

/**
 * Create a sanitized log entry
 */
export interface LogEntry {
  level: string;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

export function sanitizeLogEntry(entry: LogEntry): LogEntry {
  const sanitizedMetadata = sanitizeForLogging(
    Object.fromEntries(
      Object.entries(entry).filter(
        ([key]) => !["level", "message", "timestamp"].includes(key),
      ),
    ),
  );

  return {
    level: entry.level,
    message: sanitizeErrorMessage(entry.message),
    timestamp: entry.timestamp,
    ...(sanitizedMetadata && typeof sanitizedMetadata === "object"
      ? sanitizedMetadata as Record<string, unknown>
      : {}),
  } as LogEntry;
}
