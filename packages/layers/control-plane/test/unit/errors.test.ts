import { describe, expect, it } from "vitest";
import {
  ExchangeFSSyncError,
  ErrorCode,
  NetworkError,
  AuthError,
  StorageError,
  CorruptionError,
  RateLimitError,
  classifyGraphError,
  classifyFsError,
  wrapError,
} from "../../src/errors.js";

describe("ExchangeFSSyncError", () => {
  it("creates error with all properties", () => {
    const cause = new Error("original");
    const error = new ExchangeFSSyncError("test message", {
      code: ErrorCode.GRAPH_RATE_LIMIT,
      recoverable: true,
      phase: "fetch",
      metadata: { key: "value" },
      cause,
    });

    expect(error.message).toBe("test message");
    expect(error.name).toBe("ExchangeFSSyncError");
    expect(error.code).toBe(ErrorCode.GRAPH_RATE_LIMIT);
    expect(error.recoverable).toBe(true);
    expect(error.phase).toBe("fetch");
    expect(error.metadata).toEqual({ key: "value" });
    expect(error.cause).toBe(cause);
  });

  it("serializes to JSON correctly", () => {
    const error = new ExchangeFSSyncError("test", {
      code: ErrorCode.UNKNOWN,
      recoverable: false,
      phase: "test",
    });

    const json = error.toJSON();
    expect(json.name).toBe("ExchangeFSSyncError");
    expect(json.message).toBe("test");
    expect(json.code).toBe(ErrorCode.UNKNOWN);
    expect(json.recoverable).toBe(false);
    expect(json.phase).toBe("test");
  });
});

describe("NetworkError", () => {
  it("defaults to GRAPH_NETWORK_ERROR code", () => {
    const error = new NetworkError("network failed", { phase: "fetch" });
    expect(error.code).toBe(ErrorCode.GRAPH_NETWORK_ERROR);
    expect(error.recoverable).toBe(true);
  });

  it("allows custom code", () => {
    const error = new NetworkError("network failed", {
      phase: "fetch",
      code: ErrorCode.GRAPH_SERVER_ERROR,
    });
    expect(error.code).toBe(ErrorCode.GRAPH_SERVER_ERROR);
  });
});

describe("AuthError", () => {
  it("always uses GRAPH_AUTH_FAILED code", () => {
    const error = new AuthError("auth failed", { phase: "fetch" });
    expect(error.code).toBe(ErrorCode.GRAPH_AUTH_FAILED);
    expect(error.recoverable).toBe(false);
  });
});

describe("StorageError", () => {
  it("defaults to STORAGE_WRITE_FAILED code", () => {
    const error = new StorageError("write failed", { phase: "persist" });
    expect(error.code).toBe(ErrorCode.STORAGE_WRITE_FAILED);
  });

  it("allows custom code", () => {
    const error = new StorageError("read failed", {
      phase: "persist",
      code: ErrorCode.STORAGE_READ_FAILED,
    });
    expect(error.code).toBe(ErrorCode.STORAGE_READ_FAILED);
  });
});

describe("CorruptionError", () => {
  it("always uses CURSOR_CORRUPTED code by default", () => {
    const error = new CorruptionError("data corrupted", { phase: "read" });
    expect(error.code).toBe(ErrorCode.CURSOR_CORRUPTED);
    expect(error.recoverable).toBe(true);
  });

  it("allows custom code", () => {
    const error = new CorruptionError("checksum failed", {
      phase: "read",
      code: ErrorCode.CHECKSUM_MISMATCH,
    });
    expect(error.code).toBe(ErrorCode.CHECKSUM_MISMATCH);
  });
});

describe("RateLimitError", () => {
  it("includes retryAfterMs in metadata", () => {
    const error = new RateLimitError("rate limited", 30000, { phase: "fetch" });
    expect(error.code).toBe(ErrorCode.GRAPH_RATE_LIMIT);
    expect(error.retryAfterMs).toBe(30000);
    expect(error.metadata.retryAfterMs).toBe(30000);
  });
});

describe("classifyGraphError", () => {
  it("classifies 429 as rate limit with retry", () => {
    const result = classifyGraphError(429);
    expect(result.code).toBe(ErrorCode.GRAPH_RATE_LIMIT);
    expect(result.recoverable).toBe(true);
    expect(result.retryAfterMs).toBe(60000);
  });

  it("classifies 401/403 as auth failures", () => {
    expect(classifyGraphError(401)).toEqual({
      code: ErrorCode.GRAPH_AUTH_FAILED,
      recoverable: false,
    });
    expect(classifyGraphError(403)).toEqual({
      code: ErrorCode.GRAPH_AUTH_FAILED,
      recoverable: false,
    });
  });

  it("classifies 404 as not found", () => {
    expect(classifyGraphError(404)).toEqual({
      code: ErrorCode.GRAPH_NOT_FOUND,
      recoverable: false,
    });
  });

  it("classifies 5xx as server errors", () => {
    expect(classifyGraphError(500)).toEqual({
      code: ErrorCode.GRAPH_SERVER_ERROR,
      recoverable: true,
    });
    expect(classifyGraphError(502)).toEqual({
      code: ErrorCode.GRAPH_SERVER_ERROR,
      recoverable: true,
    });
    expect(classifyGraphError(503)).toEqual({
      code: ErrorCode.GRAPH_SERVER_ERROR,
      recoverable: true,
    });
    expect(classifyGraphError(504)).toEqual({
      code: ErrorCode.GRAPH_SERVER_ERROR,
      recoverable: true,
    });
  });

  it("classifies unknown 4xx as non-recoverable", () => {
    const result = classifyGraphError(418);
    expect(result.code).toBe(ErrorCode.UNKNOWN);
    expect(result.recoverable).toBe(false);
  });
});

describe("classifyFsError", () => {
  it("classifies ENOSPC as disk full", () => {
    const error = { code: "ENOSPC" } as NodeJS.ErrnoException;
    expect(classifyFsError(error)).toEqual({
      code: ErrorCode.STORAGE_DISK_FULL,
      recoverable: false,
    });
  });

  it("classifies EACCES/EPERM as write failures", () => {
    expect(classifyFsError({ code: "EACCES" } as NodeJS.ErrnoException)).toEqual({
      code: ErrorCode.STORAGE_WRITE_FAILED,
      recoverable: false,
    });
    expect(classifyFsError({ code: "EPERM" } as NodeJS.ErrnoException)).toEqual({
      code: ErrorCode.STORAGE_WRITE_FAILED,
      recoverable: false,
    });
  });

  it("classifies ENOENT as read failure", () => {
    expect(classifyFsError({ code: "ENOENT" } as NodeJS.ErrnoException)).toEqual({
      code: ErrorCode.STORAGE_READ_FAILED,
      recoverable: true,
    });
  });

  it("classifies path errors as corruption", () => {
    expect(classifyFsError({ code: "EISDIR" } as NodeJS.ErrnoException)).toEqual({
      code: ErrorCode.CURSOR_CORRUPTED,
      recoverable: true,
    });
    expect(classifyFsError({ code: "ENOTDIR" } as NodeJS.ErrnoException)).toEqual({
      code: ErrorCode.CURSOR_CORRUPTED,
      recoverable: true,
    });
  });
});

describe("wrapError", () => {
  it("returns ExchangeFSSyncError as-is", () => {
    const original = new ExchangeFSSyncError("original", {
      code: ErrorCode.UNKNOWN,
      recoverable: true,
      phase: "test",
    });

    const wrapped = wrapError(original, { phase: "other" });
    expect(wrapped).toBe(original);
  });

  it("wraps filesystem errors", () => {
    const fsError = Object.assign(new Error("no space"), {
      code: "ENOSPC",
      errno: -28,
      syscall: "write",
    }) as NodeJS.ErrnoException;

    const wrapped = wrapError(fsError, {
      phase: "persist",
      operation: "writeFile",
    });

    expect(wrapped).toBeInstanceOf(StorageError);
    expect(wrapped.code).toBe(ErrorCode.STORAGE_DISK_FULL);
    expect(wrapped.metadata.operation).toBe("writeFile");
    expect(wrapped.metadata.errno).toBe(-28);
    expect(wrapped.metadata.syscall).toBe("write");
  });

  it("wraps generic errors", () => {
    const error = new Error("something went wrong");
    const wrapped = wrapError(error, { phase: "fetch" });

    expect(wrapped).toBeInstanceOf(ExchangeFSSyncError);
    expect(wrapped.code).toBe(ErrorCode.UNKNOWN);
    expect(wrapped.recoverable).toBe(true);
  });

  it("wraps non-Error values", () => {
    const wrapped = wrapError("string error", { phase: "fetch" });

    expect(wrapped).toBeInstanceOf(ExchangeFSSyncError);
    expect(wrapped.message).toBe("string error");
  });
});
