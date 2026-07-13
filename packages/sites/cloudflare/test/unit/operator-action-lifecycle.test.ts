import { describe, expect, it } from "vitest";
import { assertSiteOperatorActionRequestTransition } from "../../src/operator-action-lifecycle.js";

describe("site operator action lifecycle", () => {
  it("requires execution before an action can be marked executed", () => {
    expect(() =>
      assertSiteOperatorActionRequestTransition("pending", "executed"),
    ).toThrow("invalid_site_operator_action_request_transition");

    expect(() =>
      assertSiteOperatorActionRequestTransition("pending", "executing"),
    ).not.toThrow();
    expect(() =>
      assertSiteOperatorActionRequestTransition("executing", "executed"),
    ).not.toThrow();
  });

  it("keeps terminal action states closed", () => {
    expect(() =>
      assertSiteOperatorActionRequestTransition("executed", "pending"),
    ).toThrow("invalid_site_operator_action_request_transition");
    expect(() =>
      assertSiteOperatorActionRequestTransition("rejected", "executing"),
    ).toThrow("invalid_site_operator_action_request_transition");
  });
});
