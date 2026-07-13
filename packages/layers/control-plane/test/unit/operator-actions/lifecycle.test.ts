import { describe, expect, it } from "vitest";
import {
  assertConfirmationChallengeTransition,
  assertOperatorActionRequestTransition,
  canTransitionConfirmationChallenge,
  canTransitionOperatorActionRequest,
} from "../../../src/operator-actions/lifecycle.js";

describe("operator action and confirmation lifecycle guards", () => {
  it("requires operator requests to enter execution before completion", () => {
    expect(canTransitionOperatorActionRequest("pending", "executing")).toBe(true);
    expect(canTransitionOperatorActionRequest("executing", "executed")).toBe(true);
    expect(canTransitionOperatorActionRequest("pending", "executed")).toBe(false);
    expect(() => assertOperatorActionRequestTransition("executed", "rejected"))
      .toThrow(/invalid_operator_action_request_transition/);
  });

  it("allows only pending confirmation resolution and confirmed consumption", () => {
    expect(canTransitionConfirmationChallenge("pending", "confirmed")).toBe(true);
    expect(canTransitionConfirmationChallenge("confirmed", "consumed")).toBe(true);
    expect(canTransitionConfirmationChallenge("pending", "consumed")).toBe(false);
    expect(() => assertConfirmationChallengeTransition("consumed", "expired"))
      .toThrow(/invalid_confirmation_challenge_transition/);
  });
});
