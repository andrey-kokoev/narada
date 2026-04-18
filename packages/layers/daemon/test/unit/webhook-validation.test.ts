import { describe, it, expect } from "vitest";
import {
  extractValidationToken,
  extractSignature,
  validateWebhookSignature,
  validateClientState,
  isAllowedTenant,
  sanitizeNotificationForLogging,
  generateClientState,
  WebhookRateLimiter,
  WebhookValidationError,
  validateNotification,
  type WebhookValidationConfig,
} from "../../src/webhook-validation.js";

describe("extractValidationToken", () => {
  it("should extract token from URL", () => {
    const url = "https://example.com/webhook?validationToken=abc123";
    expect(extractValidationToken(url)).toBe("abc123");
  });

  it("should return null when no token", () => {
    const url = "https://example.com/webhook";
    expect(extractValidationToken(url)).toBeNull();
  });
});

describe("extractSignature", () => {
  it("should extract signature from Bearer token", () => {
    const header = "Bearer signature123";
    expect(extractSignature(header)).toBe("signature123");
  });

  it("should return null for invalid format", () => {
    expect(extractSignature("Basic auth")).toBeNull();
    expect(extractSignature(undefined)).toBeNull();
  });
});

describe("validateClientState", () => {
  it("should return true for matching states", () => {
    expect(validateClientState("secret123", "secret123")).toBe(true);
  });

  it("should return false for non-matching states", () => {
    expect(validateClientState("secret123", "different")).toBe(false);
  });
});

describe("WebhookRateLimiter", () => {
  it("should allow requests under limit", () => {
    const limiter = new WebhookRateLimiter(60000, 5);
    for (let i = 0; i < 5; i++) {
      expect(limiter.isAllowed("client-1")).toBe(true);
    }
  });

  it("should block requests over limit", () => {
    const limiter = new WebhookRateLimiter(60000, 2);
    limiter.isAllowed("client-1");
    limiter.isAllowed("client-1");
    expect(limiter.isAllowed("client-1")).toBe(false);
  });
});

describe("generateClientState", () => {
  it("should generate state of correct length", () => {
    const state = generateClientState(32);
    expect(state).toHaveLength(32);
  });

  it("should generate different values each time", () => {
    const state1 = generateClientState();
    const state2 = generateClientState();
    expect(state1).not.toBe(state2);
  });
});
