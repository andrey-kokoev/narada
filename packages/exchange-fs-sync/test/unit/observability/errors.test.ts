import { describe, it, expect } from "vitest";
import {
  OperatorErrorCategory,
  classifyErrorToOperatorCategory,
  classifyWorkItemForOperator,
  classifyToolCallForOperator,
} from "../../../src/observability/errors.js";
import { ExchangeFSSyncError, ErrorCode } from "../../../src/errors.js";

describe("observability/errors", () => {
  describe("classifyErrorToOperatorCategory", () => {
    it("classifies runtime misconfig from durable hint", () => {
      const result = classifyErrorToOperatorCategory(
        new Error("Missing API key"),
        "dispatch",
        { workItemStatus: "failed_terminal" },
      );
      expect(result.category).toBe(OperatorErrorCategory.REPLAY_RECOVERY_ACTION);
    });

    it("classifies tool policy rejection from durable hint", () => {
      const result = classifyErrorToOperatorCategory(
        new Error("Something went wrong"),
        "tool_execution",
        { toolExitStatus: "rejected_policy" },
      );
      expect(result.category).toBe(OperatorErrorCategory.TOOL_POLICY_REJECTION);
      expect(result.recoverable).toBe(false);
    });

    it("classifies tool timeout from durable hint", () => {
      const result = classifyErrorToOperatorCategory(
        new Error("Timeout"),
        "tool_execution",
        { toolExitStatus: "timeout" },
      );
      expect(result.category).toBe(OperatorErrorCategory.TOOL_TIMEOUT);
    });

    it("maps ExchangeFSSyncError Graph rate limit to external_dependency", () => {
      const err = new ExchangeFSSyncError("Rate limited", {
        code: ErrorCode.GRAPH_RATE_LIMIT,
        recoverable: true,
        phase: "sync",
      });
      const result = classifyErrorToOperatorCategory(err, "sync");
      expect(result.category).toBe(OperatorErrorCategory.EXTERNAL_DEPENDENCY);
    });

    it("maps ExchangeFSSyncError auth failure to runtime_misconfig", () => {
      const err = new ExchangeFSSyncError("Unauthorized", {
        code: ErrorCode.GRAPH_AUTH_FAILED,
        recoverable: false,
        phase: "sync",
      });
      const result = classifyErrorToOperatorCategory(err, "sync");
      expect(result.category).toBe(OperatorErrorCategory.RUNTIME_MISCONFIG);
    });

    it("maps storage errors to storage_failure", () => {
      const err = new ExchangeFSSyncError("Disk full", {
        code: ErrorCode.STORAGE_DISK_FULL,
        recoverable: false,
        phase: "sync",
      });
      const result = classifyErrorToOperatorCategory(err, "sync");
      expect(result.category).toBe(OperatorErrorCategory.STORAGE_FAILURE);
    });

    it("falls back to message heuristics for untyped errors", () => {
      expect(classifyErrorToOperatorCategory(new Error("Config missing"), "startup").category).toBe(
        OperatorErrorCategory.RUNTIME_MISCONFIG,
      );
      expect(classifyErrorToOperatorCategory(new Error("Validation failed"), "dispatch").category).toBe(
        OperatorErrorCategory.CHARTER_VALIDATION_FAILURE,
      );
      expect(classifyErrorToOperatorCategory(new Error("Idempotency conflict"), "handoff").category).toBe(
        OperatorErrorCategory.OUTBOUND_IDEMPOTENCY_CONFLICT,
      );
      expect(classifyErrorToOperatorCategory(new Error("Replay recovery"), "recovery").category).toBe(
        OperatorErrorCategory.REPLAY_RECOVERY_ACTION,
      );
    });

    it("defaults to unknown for unrecognized errors", () => {
      const result = classifyErrorToOperatorCategory(new Error("Boom"), "sync");
      expect(result.category).toBe(OperatorErrorCategory.UNKNOWN);
    });
  });

  describe("classifyWorkItemForOperator", () => {
    it("returns null for healthy statuses", () => {
      expect(classifyWorkItemForOperator("opened", null, 0)).toBeNull();
      expect(classifyWorkItemForOperator("leased", null, 0)).toBeNull();
      expect(classifyWorkItemForOperator("executing", null, 0)).toBeNull();
      expect(classifyWorkItemForOperator("resolved", null, 0)).toBeNull();
    });

    it("maps superseded/cancelled to replay_recovery_action", () => {
      expect(classifyWorkItemForOperator("superseded", null, 0)).toBe(OperatorErrorCategory.REPLAY_RECOVERY_ACTION);
      expect(classifyWorkItemForOperator("cancelled", null, 0)).toBe(OperatorErrorCategory.REPLAY_RECOVERY_ACTION);
    });

    it("maps failed statuses using error message heuristics", () => {
      expect(classifyWorkItemForOperator("failed_retryable", "Tool policy rejected", 1)).toBe(
        OperatorErrorCategory.TOOL_POLICY_REJECTION,
      );
      expect(classifyWorkItemForOperator("failed_terminal", "Timeout executing tool", 3)).toBe(
        OperatorErrorCategory.TOOL_TIMEOUT,
      );
      expect(classifyWorkItemForOperator("failed_terminal", "Validation error", 0)).toBe(
        OperatorErrorCategory.CHARTER_VALIDATION_FAILURE,
      );
      expect(classifyWorkItemForOperator("failed_terminal", "Idempotency key collision", 0)).toBe(
        OperatorErrorCategory.OUTBOUND_IDEMPOTENCY_CONFLICT,
      );
      expect(classifyWorkItemForOperator("failed_terminal", "Config missing", 0)).toBe(
        OperatorErrorCategory.RUNTIME_MISCONFIG,
      );
      expect(classifyWorkItemForOperator("failed_terminal", "Something else", 0)).toBe(OperatorErrorCategory.UNKNOWN);
    });
  });

  describe("classifyToolCallForOperator", () => {
    it("returns null for success/pending", () => {
      expect(classifyToolCallForOperator("success")).toBeNull();
      expect(classifyToolCallForOperator("pending")).toBeNull();
    });

    it("maps rejected_policy and timeout", () => {
      expect(classifyToolCallForOperator("rejected_policy")).toBe(OperatorErrorCategory.TOOL_POLICY_REJECTION);
      expect(classifyToolCallForOperator("timeout")).toBe(OperatorErrorCategory.TOOL_TIMEOUT);
    });

    it("maps error/budget_exceeded to unknown", () => {
      expect(classifyToolCallForOperator("error")).toBe(OperatorErrorCategory.UNKNOWN);
      expect(classifyToolCallForOperator("budget_exceeded")).toBe(OperatorErrorCategory.UNKNOWN);
    });
  });
});
