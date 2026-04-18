import { describe, it, expect } from "vitest";
import {
  isValidPhaseTransition,
  isTerminalPhase,
  canConfirm,
  mapOutboundStatusToPhase,
  mapOutboundStatusToConfirmation,
  deriveConfirmationOnComplete,
  assertValidPhaseTransition,
} from "../../../src/executors/lifecycle.js";

describe("unified executor lifecycle", () => {
  it("allows valid phase transitions", () => {
    expect(isValidPhaseTransition("pending", "running")).toBe(true);
    expect(isValidPhaseTransition("pending", "completed")).toBe(true);
    expect(isValidPhaseTransition("pending", "failed")).toBe(true);
    expect(isValidPhaseTransition("running", "completed")).toBe(true);
    expect(isValidPhaseTransition("running", "failed")).toBe(true);
  });

  it("forbids invalid phase transitions", () => {
    expect(isValidPhaseTransition("completed", "running")).toBe(false);
    expect(isValidPhaseTransition("failed", "running")).toBe(false);
    expect(isValidPhaseTransition("completed", "failed")).toBe(false);
    expect(isValidPhaseTransition("running", "pending")).toBe(false);
  });

  it("identifies terminal phases", () => {
    expect(isTerminalPhase("completed")).toBe(true);
    expect(isTerminalPhase("failed")).toBe(true);
    expect(isTerminalPhase("pending")).toBe(false);
    expect(isTerminalPhase("running")).toBe(false);
  });

  it("only allows confirmation from unconfirmed", () => {
    expect(canConfirm("unconfirmed")).toBe(true);
    expect(canConfirm("confirmed")).toBe(false);
    expect(canConfirm("confirmation_failed")).toBe(false);
  });

  it("maps outbound statuses to unified phases", () => {
    expect(mapOutboundStatusToPhase("pending")).toBe("running");
    expect(mapOutboundStatusToPhase("draft_creating")).toBe("running");
    expect(mapOutboundStatusToPhase("draft_ready")).toBe("running");
    expect(mapOutboundStatusToPhase("sending")).toBe("running");
    expect(mapOutboundStatusToPhase("retry_wait")).toBe("running");
    expect(mapOutboundStatusToPhase("blocked_policy")).toBe("running");
    expect(mapOutboundStatusToPhase("submitted")).toBe("completed");
    expect(mapOutboundStatusToPhase("confirmed")).toBe("completed");
    expect(mapOutboundStatusToPhase("failed_terminal")).toBe("failed");
    expect(mapOutboundStatusToPhase("cancelled")).toBe("failed");
    expect(mapOutboundStatusToPhase("superseded")).toBe("failed");
  });

  it("maps outbound statuses to confirmation statuses", () => {
    expect(mapOutboundStatusToConfirmation("confirmed")).toBe("confirmed");
    expect(mapOutboundStatusToConfirmation("failed_terminal")).toBe("confirmation_failed");
    expect(mapOutboundStatusToConfirmation("cancelled")).toBe("confirmation_failed");
    expect(mapOutboundStatusToConfirmation("superseded")).toBe("confirmation_failed");
    expect(mapOutboundStatusToConfirmation("pending")).toBe("unconfirmed");
    expect(mapOutboundStatusToConfirmation("submitted")).toBe("unconfirmed");
    expect(mapOutboundStatusToConfirmation("sending")).toBe("unconfirmed");
  });

  it("derives confirmation from success flag", () => {
    expect(deriveConfirmationOnComplete(true)).toBe("confirmed");
    expect(deriveConfirmationOnComplete(false)).toBe("confirmation_failed");
  });

  it("assertValidPhaseTransition throws on invalid transition", () => {
    expect(() => assertValidPhaseTransition("ex-1", "completed", "running")).toThrow(
      "Invalid execution phase transition: completed -> running for ex-1",
    );
  });

  it("assertValidPhaseTransition does not throw on valid transition", () => {
    expect(() => assertValidPhaseTransition("ex-1", "pending", "running")).not.toThrow();
  });
});
