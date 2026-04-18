import { describe, it, expect } from "vitest";
import { WakeController } from "../../src/service.js";

describe("WakeController", () => {
  it("returns poll reason after sleep expires", async () => {
    const controller = new WakeController();
    const reason = await controller.sleep(10, "poll");
    expect(reason).toBe("poll");
  });

  it("returns manual wake reason when woken during sleep", async () => {
    const controller = new WakeController();
    const sleepPromise = controller.sleep(10000, "poll");
    const accepted = controller.requestWake("manual");
    expect(accepted).toBe(true);
    const reason = await sleepPromise;
    expect(reason).toBe("manual");
  });

  it("coalesces lower-priority wake when higher is already pending", async () => {
    const controller = new WakeController();
    // First wake resolves the current sleep
    controller.requestWake("manual");
    // A second lower-priority request while not sleeping should be rejected
    const accepted = controller.requestWake("retry");
    expect(accepted).toBe(false);
    expect(controller.getAndClearPendingWake()).toBe("manual");
  });

  it("replaces lower-priority pending wake with higher-priority wake between sleeps", async () => {
    const controller = new WakeController();
    // Simulate a cycle where retry was requested
    controller.requestWake("retry");
    expect(controller.getAndClearPendingWake()).toBe("retry");

    // Before the next sleep starts, a higher-priority manual arrives
    const accepted = controller.requestWake("manual");
    expect(accepted).toBe(true);
    expect(controller.getAndClearPendingWake()).toBe("manual");
  });

  it("getAndClearPendingWake returns the pending reason", () => {
    const controller = new WakeController();
    controller.requestWake("retry");
    expect(controller.getAndClearPendingWake()).toBe("retry");
    expect(controller.getAndClearPendingWake()).toBeNull();
  });

  it("stop resolves sleep with manual reason", async () => {
    const controller = new WakeController();
    const sleepPromise = controller.sleep(10000, "poll");
    controller.stop();
    const reason = await sleepPromise;
    expect(reason).toBe("manual");
  });

  it("wake priority ordering is correct", () => {
    const controller = new WakeController();
    // manual (3) > retry (2) > poll (1)
    controller.requestWake("poll");
    expect(controller.requestWake("retry")).toBe(true);
    expect(controller.requestWake("manual")).toBe(true);
    expect(controller.requestWake("retry")).toBe(false);
    expect(controller.getAndClearPendingWake()).toBe("manual");
  });
});
