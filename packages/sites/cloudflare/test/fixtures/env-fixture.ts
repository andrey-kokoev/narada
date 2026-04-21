/**
 * Cloudflare environment fixture factory.
 *
 * Builds mock `Env` objects that satisfy the `CloudflareEnv` interface
 * for both unit tests (direct coordinator access) and integration tests
 * (async stub access).
 */

import { vi } from "vitest";
import type { CloudflareEnv, CycleCoordinator, SiteCoordinator } from "../../src/coordinator.js";

function buildNamespace(stub: unknown): DurableObjectNamespace {
  return {
    idFromName: vi.fn(() => ({ toString: () => "mock-id" })),
    get: vi.fn(() => stub as unknown as DurableObjectStub),
  } as unknown as DurableObjectNamespace;
}

/** Create a mock env where `idFromName().get()` returns a synchronous CycleCoordinator. */
export function createMockEnvForRunner(
  coordinator: CycleCoordinator,
): CloudflareEnv {
  return {
    NARADA_SITE_COORDINATOR: buildNamespace(coordinator),
  };
}

/** Create a mock env where `idFromName().get()` returns an async SiteCoordinator stub. */
export function createMockEnvForHandler(
  coordinator: SiteCoordinator,
  token: string = "secret-token",
): CloudflareEnv & { NARADA_ADMIN_TOKEN: string } {
  return {
    NARADA_ADMIN_TOKEN: token,
    NARADA_SITE_COORDINATOR: buildNamespace(coordinator),
  };
}

/** Create a mock env where `idFromName().get()` returns a CycleCoordinator (for /cycle handler tests). */
export function createMockEnvForCycle(
  coordinator: CycleCoordinator,
  token: string = "secret-token",
): CloudflareEnv & { NARADA_ADMIN_TOKEN: string } {
  return {
    NARADA_ADMIN_TOKEN: token,
    NARADA_SITE_COORDINATOR: buildNamespace(coordinator),
  };
}
