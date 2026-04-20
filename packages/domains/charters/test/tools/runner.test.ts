import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ToolRunner } from "../../src/tools/runner.js";
import type { ToolInvocationRequest } from "../../src/runtime/envelope.js";
import type { ToolDefinition } from "../../src/types/coordinator.js";
import type { ToolCatalogEntry, ToolCallRecord } from "../../src/tools/index.js";

describe("ToolRunner", () => {
  let originalFetch: typeof globalThis.fetch;
  const records: ToolCallRecord[] = [];

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    records.length = 0;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function makeRunner(definitions: Record<string, ToolDefinition>) {
    return new ToolRunner({
      definitions,
      persistHook: (r) => records.push(r),
    });
  }

  function makeRequest(toolId: string, args: Record<string, unknown>): ToolInvocationRequest {
    return {
      tool_id: toolId,
      arguments_json: JSON.stringify(args),
      purpose: "test",
    };
  }

  const context = {
    execution_id: "ex-1",
    work_item_id: "wi-1",
    conversation_id: "conv-1",
    sanitized_args: { email: "a@b.com" },
  };

  describe("local_executable", () => {
    it("runs a successful local command and parses JSON stdout", async () => {
      const runner = makeRunner({
        echo: {
          id: "echo",
          source_type: "local_executable",
          executable_path: "echo",
        },
      });

      const tool: ToolCatalogEntry = {
        tool_id: "echo",
        tool_signature: "echo@v1",
        description: "Echo",
        read_only: true,
        requires_approval: false,
        timeout_ms: 5000,
        authority_class: "derive",
      };

      const request = makeRequest("echo", { email: "a@b.com" });
      const ctx = { ...context, sanitized_args: { email: "a@b.com" } };

      const result = await runner.executeToolCall(request, tool, ctx);
      expect(result.exit_status).toBe("success");
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);

      // Two records: pending + final
      expect(records).toHaveLength(2);
      expect(records[0]!.exit_status).toBe("pending");
      expect(records[1]!.exit_status).toBe("success");
      expect(records[1]!.tool_id).toBe("echo");
    });

    it("returns error when executable_path is missing", async () => {
      const runner = makeRunner({
        bad: {
          id: "bad",
          source_type: "local_executable",
        },
      });

      const tool: ToolCatalogEntry = {
        tool_id: "bad",
        tool_signature: "bad@v1",
        description: "Bad",
        read_only: true,
        requires_approval: false,
        timeout_ms: 5000,
        authority_class: "derive",
      };

      const result = await runner.executeToolCall(makeRequest("bad", {}), tool, context);
      expect(result.exit_status).toBe("error");
      expect(result.stderr).toContain("Missing executable_path");
    });

    it("returns error for non-zero exit code", async () => {
      const runner = makeRunner({
        false_cmd: {
          id: "false_cmd",
          source_type: "local_executable",
          executable_path: "false",
        },
      });

      const tool: ToolCatalogEntry = {
        tool_id: "false_cmd",
        tool_signature: "false_cmd@v1",
        description: "Always fails",
        read_only: true,
        requires_approval: false,
        timeout_ms: 5000,
        authority_class: "derive",
      };

      const result = await runner.executeToolCall(makeRequest("false_cmd", {}), tool, context);
      expect(result.exit_status).toBe("error");
      expect(result.stderr).toContain("exited with code 1");
    });
  });

  describe("http_endpoint", () => {
    it("returns success on 200 with JSON body", async () => {
      globalThis.fetch = async () =>
        ({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ result: "ok" }),
        }) as Response;

      const runner = makeRunner({
        api: {
          id: "api",
          source_type: "http_endpoint",
          url: "http://example.com/api",
        },
      });

      const tool: ToolCatalogEntry = {
        tool_id: "api",
        tool_signature: "api@v1",
        description: "API",
        read_only: true,
        requires_approval: false,
        timeout_ms: 5000,
        authority_class: "derive",
      };

      const result = await runner.executeToolCall(makeRequest("api", {}), tool, context);
      expect(result.exit_status).toBe("success");
      expect(result.structured_output).toEqual({ result: "ok" });
    });

    it("returns error on non-200 HTTP status", async () => {
      globalThis.fetch = async () =>
        ({
          ok: false,
          status: 500,
          text: async () => "Internal Server Error",
        }) as Response;

      const runner = makeRunner({
        api: {
          id: "api",
          source_type: "http_endpoint",
          url: "http://example.com/api",
        },
      });

      const tool: ToolCatalogEntry = {
        tool_id: "api",
        tool_signature: "api@v1",
        description: "API",
        read_only: true,
        requires_approval: false,
        timeout_ms: 5000,
        authority_class: "derive",
      };

      const result = await runner.executeToolCall(makeRequest("api", {}), tool, context);
      expect(result.exit_status).toBe("error");
      expect(result.stderr).toContain("HTTP 500");
    });

    it("returns timeout on fetch abort", async () => {
      globalThis.fetch = async (_input, init) => {
        return new Promise((_, reject) => {
          const signal = init?.signal;
          if (signal) {
            const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
            if (signal.aborted) {
              onAbort();
              return;
            }
            signal.addEventListener("abort", onAbort);
          }
        }) as Promise<Response>;
      };

      const runner = makeRunner({
        api: {
          id: "api",
          source_type: "http_endpoint",
          url: "http://example.com/api",
        },
      });

      const tool: ToolCatalogEntry = {
        tool_id: "api",
        tool_signature: "api@v1",
        description: "API",
        read_only: true,
        requires_approval: false,
        timeout_ms: 10,
        authority_class: "derive",
      };

      const result = await runner.executeToolCall(makeRequest("api", {}), tool, context);
      expect(result.exit_status).toBe("timeout");
    });
  });

  it("returns error when definition is missing", async () => {
    const runner = makeRunner({});
    const tool: ToolCatalogEntry = {
      tool_id: "missing",
      tool_signature: "missing@v1",
      description: "Missing",
      read_only: true,
      requires_approval: false,
      timeout_ms: 5000,
      authority_class: "derive",
    };

    const result = await runner.executeToolCall(makeRequest("missing", {}), tool, context);
    expect(result.exit_status).toBe("error");
    expect(result.stderr).toContain("Tool definition not found");
  });

  it("returns error for unimplemented docker_image", async () => {
    const runner = makeRunner({
      docker: {
        id: "docker",
        source_type: "docker_image",
        docker_image: "alpine",
      },
    });

    const tool: ToolCatalogEntry = {
      tool_id: "docker",
      tool_signature: "docker@v1",
      description: "Docker",
      read_only: true,
      requires_approval: false,
      timeout_ms: 5000,
      authority_class: "derive",
    };

    const result = await runner.executeToolCall(makeRequest("docker", {}), tool, context);
    expect(result.exit_status).toBe("error");
    expect(result.stderr).toContain("Docker execution not implemented");
  });
});
