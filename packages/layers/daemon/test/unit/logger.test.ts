import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger, resolveLogFormat } from "../../src/lib/logger.js";

describe("daemon logger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.NARADA_LOG_FORMAT;
    delete process.env.LOG_FORMAT;
  });

  it("formats pretty logs for human terminal output", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    createLogger({ component: "service", format: "pretty" }).info("Sync complete", {
      scope: "help-global-maxima",
      applied: 0,
      duration_ms: 1210,
    });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]![0]).toMatch(
      /\d\d:\d\d:\d\d INFO\s+ service: Sync complete scope=help-global-maxima applied=0 duration_ms=1210/,
    );
  });

  it("keeps JSON logs available for machine-readable output", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    createLogger({ component: "service", format: "json" }).warn("Sync failed", {
      scope: "help-global-maxima",
    });

    const entry = JSON.parse(String(errorSpy.mock.calls[0]![0])) as {
      level: string;
      message: string;
      component: string;
      meta: { scope: string };
    };
    expect(entry).toMatchObject({
      level: "warn",
      message: "Sync failed",
      component: "service",
      meta: { scope: "help-global-maxima" },
    });
  });

  it("resolves auto format from stderr TTY and env overrides", () => {
    const descriptor = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");
    Object.defineProperty(process.stderr, "isTTY", { configurable: true, value: true });
    expect(resolveLogFormat("auto")).toBe("pretty");

    Object.defineProperty(process.stderr, "isTTY", { configurable: true, value: false });
    expect(resolveLogFormat("auto")).toBe("json");

    process.env.NARADA_LOG_FORMAT = "pretty";
    expect(resolveLogFormat(undefined)).toBe("pretty");

    if (descriptor) {
      Object.defineProperty(process.stderr, "isTTY", descriptor);
    }
  });
});
