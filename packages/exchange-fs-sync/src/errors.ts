/**
 * Error classification system for exchange-fs-sync
 *
 * Provides typed error classes with metadata for recovery decisions
 */

export enum ErrorCode {
  // Graph API errors
  GRAPH_RATE_LIMIT = "GRAPH_RATE_LIMIT",
  GRAPH_AUTH_FAILED = "GRAPH_AUTH_FAILED",
  GRAPH_SERVER_ERROR = "GRAPH_SERVER_ERROR",
  GRAPH_NOT_FOUND = "GRAPH_NOT_FOUND",
  GRAPH_NETWORK_ERROR = "GRAPH_NETWORK_ERROR",

  // Storage errors
  STORAGE_WRITE_FAILED = "STORAGE_WRITE_FAILED",
  STORAGE_READ_FAILED = "STORAGE_READ_FAILED",
  STORAGE_DISK_FULL = "STORAGE_DISK_FULL",

  // Data integrity errors
  CURSOR_CORRUPTED = "CURSOR_CORRUPTED",
  MESSAGE_INCOMPLETE = "MESSAGE_INCOMPLETE",
  CHECKSUM_MISMATCH = "CHECKSUM_MISMATCH",

  // Sync errors
  SYNC_PHASE_FAILED = "SYNC_PHASE_FAILED",
  LOCK_ACQUIRE_FAILED = "LOCK_ACQUIRE_FAILED",

  // Unknown
  UNKNOWN = "UNKNOWN",
}

export interface ErrorMetadata {
  [key: string]: unknown;
}

export class ExchangeFSSyncError extends Error {
  readonly code: ErrorCode;
  readonly recoverable: boolean;
  readonly phase: string;
  readonly metadata: ErrorMetadata;
  readonly cause?: Error;

  constructor(
    message: string,
    options: {
      code: ErrorCode;
      recoverable: boolean;
      phase: string;
      metadata?: ErrorMetadata;
      cause?: Error;
    },
  ) {
    super(message);
    this.name = "ExchangeFSSyncError";
    this.code = options.code;
    this.recoverable = options.recoverable;
    this.phase = options.phase;
    this.metadata = options.metadata ?? {};
    this.cause = options.cause;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ExchangeFSSyncError);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      recoverable: this.recoverable,
      phase: this.phase,
      metadata: this.metadata,
      stack: this.stack,
      cause: this.cause
        ? {
            message: this.cause.message,
            stack: this.cause.stack,
          }
        : undefined,
    };
  }
}

export class NetworkError extends ExchangeFSSyncError {
  constructor(
    message: string,
    options: Omit<
      ConstructorParameters<typeof ExchangeFSSyncError>[1],
      "code" | "recoverable"
    > & { code?: ErrorCode; recoverable?: boolean },
  ) {
    super(message, {
      ...options,
      code: options.code ?? ErrorCode.GRAPH_NETWORK_ERROR,
      recoverable: options.recoverable ?? true,
    });
    this.name = "NetworkError";
  }
}

export class AuthError extends ExchangeFSSyncError {
  constructor(
    message: string,
    options: Omit<
      ConstructorParameters<typeof ExchangeFSSyncError>[1],
      "code" | "recoverable"
    >,
  ) {
    super(message, {
      ...options,
      code: ErrorCode.GRAPH_AUTH_FAILED,
      recoverable: false,
    });
    this.name = "AuthError";
  }
}

export class StorageError extends ExchangeFSSyncError {
  constructor(
    message: string,
    options: Omit<
      ConstructorParameters<typeof ExchangeFSSyncError>[1],
      "code"
    > & { code?: ErrorCode },
  ) {
    super(message, {
      ...options,
      code: options.code ?? ErrorCode.STORAGE_WRITE_FAILED,
      recoverable: options.recoverable ?? true,
    });
    this.name = "StorageError";
  }
}

export class CorruptionError extends ExchangeFSSyncError {
  constructor(
    message: string,
    options: Omit<
      ConstructorParameters<typeof ExchangeFSSyncError>[1],
      "code"
    > & { code?: ErrorCode },
  ) {
    super(message, {
      ...options,
      code: options.code ?? ErrorCode.CURSOR_CORRUPTED,
      recoverable: true,
    });
    this.name = "CorruptionError";
  }
}

export class RateLimitError extends ExchangeFSSyncError {
  readonly retryAfterMs: number;

  constructor(
    message: string,
    retryAfterMs: number,
    options: Omit<
      ConstructorParameters<typeof ExchangeFSSyncError>[1],
      "code" | "recoverable"
    >,
  ) {
    super(message, {
      ...options,
      code: ErrorCode.GRAPH_RATE_LIMIT,
      recoverable: true,
      metadata: {
        ...options.metadata,
        retryAfterMs,
      },
    });
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Classify a Graph API HTTP status code into an error code
 */
export function classifyGraphError(
  status: number,
  responseText?: string,
): { code: ErrorCode; recoverable: boolean; retryAfterMs?: number } {
  switch (status) {
    case 429:
      // Try to extract Retry-After from response or default to 60s
      return { code: ErrorCode.GRAPH_RATE_LIMIT, recoverable: true, retryAfterMs: 60000 };
    case 401:
    case 403:
      return { code: ErrorCode.GRAPH_AUTH_FAILED, recoverable: false };
    case 404:
      return { code: ErrorCode.GRAPH_NOT_FOUND, recoverable: false };
    case 500:
    case 502:
    case 503:
    case 504:
      return { code: ErrorCode.GRAPH_SERVER_ERROR, recoverable: true };
    default:
      if (status >= 500) {
        return { code: ErrorCode.GRAPH_SERVER_ERROR, recoverable: true };
      }
      return { code: ErrorCode.UNKNOWN, recoverable: false };
  }
}

/**
 * Classify a Node.js filesystem error
 */
export function classifyFsError(error: NodeJS.ErrnoException): {
  code: ErrorCode;
  recoverable: boolean;
} {
  switch (error.code) {
    case "ENOSPC":
      return { code: ErrorCode.STORAGE_DISK_FULL, recoverable: false };
    case "EACCES":
    case "EPERM":
      return { code: ErrorCode.STORAGE_WRITE_FAILED, recoverable: false };
    case "ENOENT":
      return { code: ErrorCode.STORAGE_READ_FAILED, recoverable: true };
    case "EISDIR":
    case "ENOTDIR":
      return { code: ErrorCode.CURSOR_CORRUPTED, recoverable: true };
    default:
      return { code: ErrorCode.UNKNOWN, recoverable: true };
  }
}

/**
 * Wrap an unknown error into a typed ExchangeFSSyncError
 */
export function wrapError(
  error: unknown,
  context: { phase: string; messageId?: string; operation?: string },
): ExchangeFSSyncError {
  if (error instanceof ExchangeFSSyncError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? error : undefined;

  // Check if it's a filesystem error
  if (error && typeof error === "object" && "code" in error) {
    const fsError = error as NodeJS.ErrnoException;
    const classified = classifyFsError(fsError);

    return new StorageError(message, {
      ...classified,
      phase: context.phase,
      metadata: {
        messageId: context.messageId,
        operation: context.operation,
        errno: fsError.errno,
        syscall: fsError.syscall,
      },
      cause,
    });
  }

  return new ExchangeFSSyncError(message, {
    code: ErrorCode.UNKNOWN,
    recoverable: true,
    phase: context.phase,
    metadata: {
      messageId: context.messageId,
      operation: context.operation,
    },
    cause,
  });
}
