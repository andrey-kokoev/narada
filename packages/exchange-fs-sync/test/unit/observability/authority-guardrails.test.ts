/**
 * Task 073 — UI Authority Guardrails
 *
 * These tests enforce that the observability layer cannot become an accidental
 * control plane. They cover both compile-time type boundaries and runtime
 * query invariants.
 */

import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import type {
  CoordinatorStore,
  CoordinatorStoreView,
  CoordinatorStoreOperatorView,
} from "../../src/coordinator/types.js";

const queriesPath = resolve(import.meta.dirname, "..", "..", "..", "src", "observability", "queries.ts");
const typesPath = resolve(import.meta.dirname, "..", "..", "..", "src", "observability", "types.ts");

// Compile-time assertions: CoordinatorStoreView must exclude direct mutations
type AssertExcluded<K extends string> = K extends keyof CoordinatorStoreView ? never : true;
const _assertInsertWorkItem: AssertExcluded<"insertWorkItem"> = true;
const _assertUpdateWorkItemStatus: AssertExcluded<"updateWorkItemStatus"> = true;
const _assertInsertLease: AssertExcluded<"insertLease"> = true;
const _assertReleaseLease: AssertExcluded<"releaseLease"> = true;
const _assertInsertDecision: AssertExcluded<"insertDecision"> = true;
const _assertInsertAgentSession: AssertExcluded<"insertAgentSession"> = true;
const _assertInsertExecutionAttempt: AssertExcluded<"insertExecutionAttempt"> = true;
const _assertInsertEvaluation: AssertExcluded<"insertEvaluation"> = true;
const _assertInsertCharterOutput: AssertExcluded<"insertCharterOutput"> = true;
const _assertInsertToolCallRecord: AssertExcluded<"insertToolCallRecord"> = true;
const _assertUpsertConversationRecord: AssertExcluded<"upsertConversationRecord"> = true;

// Compile-time assertions: CoordinatorStoreOperatorView must still exclude core control-plane mutations
type AssertOperatorExcluded<K extends string> = K extends keyof CoordinatorStoreOperatorView ? never : true;
const _opAssertInsertWorkItem: AssertOperatorExcluded<"insertWorkItem"> = true;
const _opAssertInsertLease: AssertOperatorExcluded<"insertLease"> = true;
const _opAssertInsertDecision: AssertOperatorExcluded<"insertDecision"> = true;
const _opAssertInsertAgentSession: AssertOperatorExcluded<"insertAgentSession"> = true;
const _opAssertInsertExecutionAttempt: AssertOperatorExcluded<"insertExecutionAttempt"> = true;
const _opAssertInsertCharterOutput: AssertOperatorExcluded<"insertCharterOutput"> = true;
const _opAssertInsertToolCallRecord: AssertOperatorExcluded<"insertToolCallRecord"> = true;

// Verify the full CoordinatorStore still has the mutations (sanity check that types haven't been inverted)
const _fullStoreHasInsert: "insertWorkItem" extends keyof CoordinatorStore ? true : never = true;

describe("observability authority guardrails", () => {
  it("CoordinatorStoreView excludes all control-plane write methods", () => {
    // Satisfied by the compile-time assertions above; this runtime test documents the invariant.
    expect(true).toBe(true);
  });

  it("CoordinatorStoreOperatorView excludes scheduler, foreman, and intent mutations", () => {
    // Satisfied by compile-time assertions above.
    expect(true).toBe(true);
  });

  it("observability queries contain no INSERT, UPDATE, or DELETE SQL statements", () => {
    const source = execSync(`cat "${queriesPath}"`, { encoding: "utf8" });

    // Extract all backtick SQL strings (rough heuristic)
    const sqlBlocks: string[] = [];
    const backtickRegex = /`([^`]+)`/g;
    let match: RegExpExecArray | null;
    while ((match = backtickRegex.exec(source)) !== null) {
      const block = match[1]!;
      // Exclude JavaScript template interpolations; require genuine SQL keywords
      if (
        !block.includes("${") &&
        /\b(select|from|where|join|group by|order by|limit|count\()\b/i.test(block)
      ) {
        sqlBlocks.push(block);
      }
    }

    expect(sqlBlocks.length).toBeGreaterThan(0);

    for (const sql of sqlBlocks) {
      const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
      // Every observability SQL must begin with SELECT
      expect(normalized.startsWith("select")).toBe(true);
      expect(normalized).not.toMatch(/\b(insert|update|delete)\b/);
    }
  });

  it("marks snapshot sources as authoritative, derived, or decorative", () => {
    const source = execSync(`cat "${typesPath}"`, { encoding: "utf8" });

    // Key types should have @source annotations
    const expectedAnnotations = [
      "@source derived",
      "@source authoritative",
    ];
    for (const annotation of expectedAnnotations) {
      expect(source).toContain(annotation);
    }

    // SourceTrust type must exist
    expect(source).toContain('export type SourceTrust = "authoritative" | "derived" | "decorative"');
  });
});
