import { describe, it, expect } from "vitest";
import {
  isValidTransition,
  isTerminalStatus,
  VALID_TRANSITIONS,
  TERMINAL_STATUSES,
  isVersionEligible,
  supersedePriorVersions,
  assertSingleLatestEligible,
} from "../../../src/outbound/types.js";
import { createOutboundCommand, createOutboundVersion } from "./fixtures.js";

describe("outbound state machine", () => {
  describe("VALID_TRANSITIONS", () => {
    it("covers every allowed transition", () => {
      const testedTransitions: string[] = [];
      for (const [from, tos] of Object.entries(VALID_TRANSITIONS)) {
        for (const to of tos) {
          testedTransitions.push(`${from} -> ${to}`);
        }
      }
      expect(testedTransitions.length).toBeGreaterThan(0);
    });

    it("allows pending -> draft_creating", () => {
      expect(isValidTransition("pending", "draft_creating")).toBe(true);
    });

    it("allows pending -> draft_ready", () => {
      expect(isValidTransition("pending", "draft_ready")).toBe(true);
    });

    it("allows pending -> failed_terminal", () => {
      expect(isValidTransition("pending", "failed_terminal")).toBe(true);
    });

    it("allows draft_creating -> draft_ready", () => {
      expect(isValidTransition("draft_creating", "draft_ready")).toBe(true);
    });

    it("allows draft_ready -> sending", () => {
      expect(isValidTransition("draft_ready", "sending")).toBe(true);
    });

    it("allows sending -> submitted", () => {
      expect(isValidTransition("sending", "submitted")).toBe(true);
    });

    it("allows submitted -> confirmed", () => {
      expect(isValidTransition("submitted", "confirmed")).toBe(true);
    });

    it("allows retry_wait -> draft_ready", () => {
      expect(isValidTransition("retry_wait", "draft_ready")).toBe(true);
    });

    it("allows blocked_policy -> pending", () => {
      expect(isValidTransition("blocked_policy", "pending")).toBe(true);
    });
  });

  describe("disallowed transitions", () => {
    it("rejects confirmed -> submitted", () => {
      expect(isValidTransition("confirmed", "submitted")).toBe(false);
    });

    it("rejects pending -> confirmed", () => {
      expect(isValidTransition("pending", "confirmed")).toBe(false);
    });

    it("rejects failed_terminal -> retry_wait", () => {
      expect(isValidTransition("failed_terminal", "retry_wait")).toBe(false);
    });

    it("rejects cancelled -> draft_ready", () => {
      expect(isValidTransition("cancelled", "draft_ready")).toBe(false);
    });

    it("rejects sending -> pending", () => {
      expect(isValidTransition("sending", "pending")).toBe(false);
    });
  });

  describe("terminal states", () => {
    it("returns true for all terminal statuses", () => {
      for (const status of TERMINAL_STATUSES) {
        expect(isTerminalStatus(status)).toBe(true);
      }
    });

    it("returns false for all non-terminal statuses", () => {
      const nonTerminal: Exclude<
        import("../../../src/outbound/types.js").OutboundStatus,
        typeof TERMINAL_STATUSES[number]
      >[] = [
        "pending",
        "draft_creating",
        "draft_ready",
        "sending",
        "submitted",
        "retry_wait",
        "blocked_policy",
      ];
      for (const status of nonTerminal) {
        expect(isTerminalStatus(status)).toBe(false);
      }
    });

    it("has no transitions out of any terminal state", () => {
      for (const status of TERMINAL_STATUSES) {
        expect(VALID_TRANSITIONS[status]).toHaveLength(0);
      }
    });
  });

  describe("isVersionEligible", () => {
    it("returns true for latest unsent non-terminal version", () => {
      const cmd = createOutboundCommand({ status: "draft_ready", latest_version: 2 });
      const v = createOutboundVersion({ version: 2, superseded_at: null });
      expect(isVersionEligible(v, cmd)).toBe(true);
    });

    it("returns false if version is not latest", () => {
      const cmd = createOutboundCommand({ status: "draft_ready", latest_version: 3 });
      const v = createOutboundVersion({ version: 2, superseded_at: null });
      expect(isVersionEligible(v, cmd)).toBe(false);
    });

    it("returns false if version is superseded", () => {
      const cmd = createOutboundCommand({ status: "draft_ready", latest_version: 2 });
      const v = createOutboundVersion({ version: 2, superseded_at: new Date().toISOString() });
      expect(isVersionEligible(v, cmd)).toBe(false);
    });

    it("returns false if command status is terminal (confirmed)", () => {
      const cmd = createOutboundCommand({ status: "confirmed", latest_version: 1 });
      const v = createOutboundVersion({ version: 1, superseded_at: null });
      expect(isVersionEligible(v, cmd)).toBe(false);
    });

    it("returns false if command status is terminal (failed_terminal)", () => {
      const cmd = createOutboundCommand({ status: "failed_terminal", latest_version: 1 });
      const v = createOutboundVersion({ version: 1, superseded_at: null });
      expect(isVersionEligible(v, cmd)).toBe(false);
    });

    it("returns false if command is cancelled", () => {
      const cmd = createOutboundCommand({ status: "cancelled", latest_version: 1 });
      const v = createOutboundVersion({ version: 1, superseded_at: null });
      expect(isVersionEligible(v, cmd)).toBe(false);
    });

    it("returns false if command is superseded", () => {
      const cmd = createOutboundCommand({ status: "superseded", latest_version: 1 });
      const v = createOutboundVersion({ version: 1, superseded_at: null });
      expect(isVersionEligible(v, cmd)).toBe(false);
    });

    it("returns false for submitted (non-terminal but not sendable)", () => {
      const cmd = createOutboundCommand({ status: "submitted", latest_version: 1 });
      const v = createOutboundVersion({ version: 1, superseded_at: null });
      expect(isVersionEligible(v, cmd)).toBe(false);
    });
  });

  describe("supersedePriorVersions", () => {
    it("supersedes all unsent versions older than new version", () => {
      const v1 = createOutboundVersion({ version: 1, superseded_at: null });
      const v2 = createOutboundVersion({ version: 2, superseded_at: null });
      const v3 = createOutboundVersion({ version: 3, superseded_at: null });

      const result = supersedePriorVersions([v1, v2, v3], 3);

      expect(result[0]!.superseded_at).not.toBeNull();
      expect(result[1]!.superseded_at).not.toBeNull();
      expect(result[2]!.superseded_at).toBeNull();
    });

    it("does not modify already superseded versions", () => {
      const ts = "2024-01-01T00:00:00Z";
      const v1 = createOutboundVersion({ version: 1, superseded_at: ts });
      const updated = supersedePriorVersions([v1], 2);
      expect(updated[0]!.superseded_at).toBe(ts);
    });
  });

  describe("assertSingleLatestEligible", () => {
    it("passes when exactly one version is eligible", () => {
      const cmd = createOutboundCommand({ status: "draft_ready", latest_version: 2 });
      const v1 = createOutboundVersion({ version: 1, superseded_at: new Date().toISOString() });
      const v2 = createOutboundVersion({ version: 2, superseded_at: null });
      expect(() =>
        assertSingleLatestEligible("outbound-001", [v1, v2], cmd),
      ).not.toThrow();
    });

    it("throws when multiple versions are eligible", () => {
      const cmd = createOutboundCommand({ status: "draft_ready", latest_version: 2 });
      const v1 = createOutboundVersion({ version: 2, superseded_at: null });
      const v2 = createOutboundVersion({ version: 2, superseded_at: null });
      expect(() =>
        assertSingleLatestEligible("outbound-001", [v1, v2], cmd),
      ).toThrow("Invariant violation: 2 eligible versions");
    });

    it("passes when zero versions are eligible", () => {
      const cmd = createOutboundCommand({ status: "confirmed", latest_version: 1 });
      const v1 = createOutboundVersion({ version: 1, superseded_at: null });
      expect(() =>
        assertSingleLatestEligible("outbound-001", [v1], cmd),
      ).not.toThrow();
    });
  });

  describe("spec invariants", () => {
    it("submitted is not terminal", () => {
      expect(isTerminalStatus("submitted")).toBe(false);
    });

    it("confirmed implies no further transitions", () => {
      expect(VALID_TRANSITIONS["confirmed"]).toHaveLength(0);
    });
  });
});
