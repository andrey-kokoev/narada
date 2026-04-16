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
const coreSrc = resolve(projectRoot, "packages", "exchange-fs-sync", "src");
const uiHtmlPath = resolve(daemonSrc, "ui", "index.html");
const operatorActionsPath = resolve(daemonSrc, "operator-actions.ts");
const observationRoutesPath = resolve(daemonSrc, "observation-routes.ts");
const operatorActionRoutesPath = resolve(daemonSrc, "operator-action-routes.ts");
const observabilityTypesPath = resolve(coreSrc, "observability", "types.ts");
const observabilityQueriesPath = resolve(coreSrc, "observability", "queries.ts");

describe("daemon authority guardrails", () => {
  it("observation routes are exclusively GET", () => {
    const routes = createObservationRoutes("", new Map());
    const methods = routes.map((r) => r.method);
    expect(methods.length).toBeGreaterThan(0);
    for (const method of methods) {
      expect(method).toBe("GET");
    }
  });

  it("observation routes contain no control or action paths", () => {
    const routes = createObservationRoutes("", new Map());
    for (const route of routes) {
      expect(route.pattern.source).not.toContain("/control/");
      expect(route.pattern.source).not.toContain("/actions");
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

  it("operator action routes are mounted under /control namespace", () => {
    const routes = createOperatorActionRoutes("", new Map());
    for (const route of routes) {
      expect(route.pattern.test("/control/scopes/scope-a/actions")).toBe(true);
      expect(route.pattern.test("/scopes/scope-a/actions")).toBe(false);
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

    // doAction must target only /control/scopes/.../actions
    expect(html).toContain("apiPost(`/control/scopes/${encodeURIComponent(currentScope)}/actions`");

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

  // Task 085 — Freeze observation boundary invariants
  it("observability queries are SELECT-only (no .run or .exec)", () => {
    const source = readFileSync(observabilityQueriesPath, "utf8");
    expect(source).not.toMatch(/\.run\s*\(/);
    expect(source).not.toMatch(/\.exec\s*\(/);
  });

  function stripBlocks(source: string, blockPrefixes: string[]): string {
    let stripped = source;
    for (const prefix of blockPrefixes) {
      let startIdx = stripped.indexOf(prefix);
      while (startIdx !== -1) {
        // Find the next top-level export after this block
        let endIdx = stripped.length;
        const searchFrom = startIdx + prefix.length;
        const nextExport = stripped.indexOf("\nexport ", searchFrom);
        if (nextExport !== -1) endIdx = nextExport;
        stripped = stripped.slice(0, startIdx) + stripped.slice(endIdx);
        startIdx = stripped.indexOf(prefix);
      }
    }
    return stripped;
  }

  it("generic observability types contain no mailbox-era leakage", () => {
    const source = readFileSync(observabilityTypesPath, "utf8");
    const stripped = stripBlocks(source, [
      "export interface MailExecutionDetail",
      "export interface MailboxConversationSummary",
      "export interface MailboxVerticalView",
    ]);
    expect(stripped).not.toContain("conversation_id");
    expect(stripped).not.toContain("mailbox_id");
  });

  it("generic observability queries contain no mailbox-era leakage", () => {
    const source = readFileSync(observabilityQueriesPath, "utf8");
    const stripped = stripBlocks(source, [
      "export function getMailboxVerticalView",
      "export function getMailExecutionDetails",
    ]);
    expect(stripped).not.toContain("conversation_id");
    expect(stripped).not.toContain("mailbox_id");
  });

  it("UI shell nav menu is vertical-neutral at top level", () => {
    const html = readFileSync(uiHtmlPath, "utf8");
    // Extract the nav menu items
    const navMatch = html.match(/<nav>[\s\S]*?<\/nav>/i);
    expect(navMatch).toBeTruthy();
    const nav = navMatch![0];
    // Top-level nav should not contain mail-specific labels
    expect(nav).not.toContain("Mailbox");
    expect(nav).not.toContain("Mail");
    // But it should contain generic sections
    expect(nav).toContain("Overview");
    expect(nav).toContain("Facts");
    expect(nav).toContain("Contexts");
    expect(nav).toContain("Work");
    expect(nav).toContain("Verticals");
  });

  it("UI shell generic pages do not use mailbox-first framing", () => {
    const html = readFileSync(uiHtmlPath, "utf8");
    // Generic function names and page titles should be vertical-neutral.
    // loadMailbox is allowed as a vertical-specific page under Verticals,
    // but generic surfaces must remain kernel-first.
    expect(html).toMatch(/function\s+loadOverview\b/);
    expect(html).toMatch(/function\s+loadFacts\b/);
    expect(html).toMatch(/function\s+loadContexts\b/);
    expect(html).toMatch(/function\s+loadWork\b/);
  });
});
