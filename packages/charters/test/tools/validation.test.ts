import { describe, it, expect } from "vitest";
import { validateToolRequest } from "../../src/tools/validation.js";
import type { ToolCatalogEntry, SideEffectBudget } from "../../src/tools/resolver.js";
import type { ToolInvocationRequest } from "../../src/runtime/envelope.js";

function makeCatalog(entries: Partial<ToolCatalogEntry>[]): ToolCatalogEntry[] {
  return entries.map((e) => ({
    tool_id: e.tool_id ?? "t1",
    purpose: e.purpose ?? "test",
    read_only: e.read_only ?? true,
    requires_approval: e.requires_approval ?? false,
    schema_args: e.schema_args,
    timeout_ms: e.timeout_ms ?? 5000,
  }));
}

function makeRequest(toolId: string, args: Record<string, unknown>): ToolInvocationRequest {
  return {
    tool_id: toolId,
    arguments_json: JSON.stringify(args),
    purpose: "test",
  };
}

const defaultBudget: SideEffectBudget = {
  max_tool_calls: 10,
  max_write_tool_calls: 2,
  total_timeout_ms: 30000,
};

const emptyBudgetState = {
  tool_calls_used: 0,
  write_tool_calls_used: 0,
  total_duration_ms_used: 0,
};

describe("validateToolRequest", () => {
  it("Rule 1: rejects tool not in catalog", () => {
    const result = validateToolRequest(
      makeRequest("missing", {}),
      makeCatalog([]),
      defaultBudget,
      emptyBudgetState,
      {},
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not in the available catalog");
  });

  it("Rule 3: rejects tool requiring approval without approval", () => {
    const result = validateToolRequest(
      makeRequest("t1", {}),
      makeCatalog([{ tool_id: "t1", requires_approval: true }]),
      defaultBudget,
      emptyBudgetState,
      {},
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("requires approval");
  });

  it("Rule 3: allows approved tool", () => {
    const result = validateToolRequest(
      makeRequest("t1", {}),
      makeCatalog([{ tool_id: "t1", requires_approval: true }]),
      defaultBudget,
      emptyBudgetState,
      { t1: true },
    );
    expect(result.allowed).toBe(true);
  });

  it("Rule 4: rejects write tool when write budget is 0", () => {
    const result = validateToolRequest(
      makeRequest("t1", {}),
      makeCatalog([{ tool_id: "t1", read_only: false }]),
      { ...defaultBudget, max_write_tool_calls: 0 },
      emptyBudgetState,
      {},
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Write tools are not permitted");
  });

  it("Rule 4: rejects write tool when write budget exhausted", () => {
    const result = validateToolRequest(
      makeRequest("t1", {}),
      makeCatalog([{ tool_id: "t1", read_only: false }]),
      defaultBudget,
      { ...emptyBudgetState, write_tool_calls_used: 2 },
      {},
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Write tool call budget exhausted");
  });

  it("Rule 6: rejects when total tool call budget exhausted", () => {
    const result = validateToolRequest(
      makeRequest("t1", {}),
      makeCatalog([{ tool_id: "t1" }]),
      defaultBudget,
      { ...emptyBudgetState, tool_calls_used: 10 },
      {},
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Tool call budget exhausted");
  });

  it("Rule 6: rejects when cumulative timeout budget exhausted", () => {
    const result = validateToolRequest(
      makeRequest("t1", {}),
      makeCatalog([{ tool_id: "t1" }]),
      defaultBudget,
      { ...emptyBudgetState, total_duration_ms_used: 30000 },
      {},
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Cumulative tool timeout budget exhausted");
  });

  it("Rule 5: rejects missing required argument", () => {
    const result = validateToolRequest(
      makeRequest("t1", {}),
      makeCatalog([
        {
          tool_id: "t1",
          schema_args: [{ name: "email", type: "string", required: true, description: "Email" }],
        },
      ]),
      defaultBudget,
      emptyBudgetState,
      {},
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Missing required argument 'email'");
  });

  it("Rule 5: rejects wrong argument type", () => {
    const result = validateToolRequest(
      makeRequest("t1", { count: "not-a-number" }),
      makeCatalog([
        {
          tool_id: "t1",
          schema_args: [{ name: "count", type: "number", required: true, description: "Count" }],
        },
      ]),
      defaultBudget,
      emptyBudgetState,
      {},
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("expected type 'number'");
  });

  it("Rule 5: rejects unknown arguments", () => {
    const result = validateToolRequest(
      makeRequest("t1", { email: "a@b.com", extra: 1 }),
      makeCatalog([
        {
          tool_id: "t1",
          schema_args: [{ name: "email", type: "string", required: true, description: "Email" }],
        },
      ]),
      defaultBudget,
      emptyBudgetState,
      {},
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Unknown argument 'extra'");
  });

  it("Rule 7: rejects string arg with shell metacharacters", () => {
    const result = validateToolRequest(
      makeRequest("t1", { cmd: "rm -rf /; echo bad" }),
      makeCatalog([
        {
          tool_id: "t1",
          schema_args: [{ name: "cmd", type: "string", required: true, description: "Command" }],
        },
      ]),
      defaultBudget,
      emptyBudgetState,
      {},
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("forbidden shell metacharacters");
  });

  it("allows valid read-only tool request", () => {
    const result = validateToolRequest(
      makeRequest("t1", { email: "a@b.com", count: 5 }),
      makeCatalog([
        {
          tool_id: "t1",
          schema_args: [
            { name: "email", type: "string", required: true, description: "Email" },
            { name: "count", type: "number", required: false, description: "Count" },
          ],
        },
      ]),
      defaultBudget,
      emptyBudgetState,
      {},
    );
    expect(result.allowed).toBe(true);
    expect(result.sanitized_args).toEqual({ email: "a@b.com", count: 5 });
  });
});
