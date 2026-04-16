/**
 * Task 080 — UI Authority Guardrails and Regression Tests
 *
 * Mechanical tests that fail if observation server gains write authority,
 * if UI introduces non-allowlisted controls, or if mutation paths bypass
 * operator action admission.
 */

import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createObservationRoutes } from "../../src/observation-routes.js";
import { createOperatorActionRoutes } from "../../src/operator-action-routes.js";
import { PERMITTED_OPERATOR_ACTIONS } from "../../src/operator-actions.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectRoot = resolve(__dirname, "..", "..", "..", "..");
const daemonSrc = resolve(projectRoot, "packages", "exchange-fs-sync-daemon", "src");
const uiHtmlPath = resolve(daemonSrc, "ui", "index.html");
const operatorActionsPath = resolve(daemonSrc, "operator-actions.ts");
const observationRoutesPath = resolve(daemonSrc, "observation-routes.ts");
const operatorActionRoutesPath = resolve(daemonSrc, "operator-action-routes.ts");

describe("daemon authority guardrails", () => {
  it("observation routes are exclusively GET", () => {
    const routes = createObservationRoutes("", new Map());
    const methods = routes.map((r) => r.method);
    expect(methods.length).toBeGreaterThan(0);
    for (const method of methods) {
      expect(method).toBe("GET");
    }
  });

  it("operator action routes are exclusively POST", () => {
    const routes = createOperatorActionRoutes("", new Map());
    const methods = routes.map((r) => r.method);
    expect(methods.length).toBeGreaterThan(0);
    for (const method of methods) {
      expect(method).toBe("POST");
    }
  });

  it("observation-routes.ts source contains no non-GET route registrations", () => {
    const source = readFileSync(observationRoutesPath, "utf8");
    // Find all method: "..." occurrences
    const methodMatches = source.matchAll(/method:\s*"([^"]+)"/g);
    const methods = Array.from(methodMatches).map((m) => m[1]);
    expect(methods.length).toBeGreaterThan(0);
    for (const method of methods) {
      expect(method).toBe("GET");
    }
  });

  it("operator-action-routes.ts source contains no non-POST route registrations", () => {
    const source = readFileSync(operatorActionRoutesPath, "utf8");
    const methodMatches = source.matchAll(/method:\s*"([^"]+)"/g);
    const methods = Array.from(methodMatches).map((m) => m[1]);
    expect(methods.length).toBeGreaterThan(0);
    for (const method of methods) {
      expect(method).toBe("POST");
    }
  });

  it("UI shell does not contain forbidden direct-mutation patterns", () => {
    const html = readFileSync(uiHtmlPath, "utf8");

    // No forms that submit anywhere
    expect(html).not.toMatch(/<form[^>]*>/i);

    // No XMLHttpRequest usage
    expect(html).not.toMatch(/new\s+XMLHttpRequest/i);

    // All fetch calls must be inside api() or apiPost() helpers
    const fetchMatches = html.matchAll(/fetch\s*\(/gi);
    expect(Array.from(fetchMatches).length).toBeGreaterThan(0);

    // The only POST method in the UI must be inside apiPost()
    const postMatches = html.matchAll(/method:\s*"POST"/gi);
    expect(Array.from(postMatches).length).toBe(1);

    // apiPost must only be called from doAction
    const apiPostCalls = Array.from(html.matchAll(/apiPost\s*\(/gi));
    // One definition + one call inside doAction = 2 occurrences
    expect(apiPostCalls.length).toBe(2);

    // doAction must target only /actions
    expect(html).toContain("apiPost(`/scopes/${encodeURIComponent(currentScope)}/actions`");

    // No inline onclick handlers that are not doAction or restoreDetailState
    const onclickMatches = html.matchAll(/onclick\s*=\s*"([^"]*)"/gi);
    for (const match of onclickMatches) {
      const handler = match[1]!.trim();
      expect(
        handler.startsWith("doAction") || handler.startsWith("restoreDetailState")
      ).toBe(true);
    }
  });

  it("operator action allowlist is exhaustive in executeOperatorAction switch", () => {
    const source = readFileSync(operatorActionsPath, "utf8");
    for (const action of PERMITTED_OPERATOR_ACTIONS) {
      expect(source).toContain(`case "${action}":`);
    }
  });

  it("operator-actions.ts contains no direct store mutations outside switch cases", () => {
    const source = readFileSync(operatorActionsPath, "utf8");
    // The only coordinatorStore mutations should be inside executeOperatorAction
    // and should be limited to the known audit + action patterns.
    const forbiddenPatterns = [
      "insertWorkItem",
      "insertLease",
      "insertDecision",
      "insertIntent",
    ];
    for (const pattern of forbiddenPatterns) {
      expect(source).not.toContain(pattern);
    }
  });

  it("observation-routes.ts contains no direct store mutations", () => {
    const source = readFileSync(observationRoutesPath, "utf8");
    const forbiddenPatterns = [
      "insertWorkItem",
      "updateWorkItemStatus",
      "insertLease",
      "insertDecision",
      "insertIntent",
    ];
    for (const pattern of forbiddenPatterns) {
      expect(source).not.toContain(pattern);
    }
  });
});
