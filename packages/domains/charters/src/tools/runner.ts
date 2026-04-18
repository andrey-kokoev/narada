/**
 * Tool Runner
 *
 * Executes validated tool requests against their definitions,
 * enforces timeouts, and produces durable tool call records.
 *
 * Spec: .ai/tasks/20260414-007-assignment-agent-c-tool-binding-runtime.md
 */

import { spawn } from "node:child_process";
import type { ToolInvocationRequest } from "../runtime/envelope.js";
import type { ToolDefinition } from "../types/coordinator.js";
import type { ToolCatalogEntry } from "../runtime/envelope.js";

export interface ToolResult {
  exit_status: "success" | "timeout" | "permission_denied" | "error" | "budget_exceeded";
  stdout: string;
  stderr: string;
  structured_output?: Record<string, unknown>;
  duration_ms: number;
}

export interface ToolCallRecord {
  call_id: string;
  execution_id: string;
  work_item_id: string;
  conversation_id: string;
  tool_id: string;
  request_args_json: string;
  exit_status: "pending" | "success" | "timeout" | "permission_denied" | "error" | "budget_exceeded";
  stdout: string;
  stderr: string;
  structured_output_json: string | null;
  started_at: string;
  completed_at: string;
  duration_ms: number;
}

export interface PersistToolCallHook {
  (record: ToolCallRecord): void | Promise<void>;
}

export interface ToolRunnerOptions {
  definitions: Record<string, ToolDefinition>;
  persistHook?: PersistToolCallHook;
}

export class ToolRunner {
  constructor(private readonly opts: ToolRunnerOptions) {}

  async executeToolCall(
    request: ToolInvocationRequest,
    tool: ToolCatalogEntry,
    context: {
      execution_id: string;
      work_item_id: string;
      conversation_id: string;
      sanitized_args: Record<string, unknown>;
    },
  ): Promise<ToolResult> {
    const definition = this.opts.definitions[tool.tool_id];
    if (!definition) {
      const result: ToolResult = {
        exit_status: "error",
        stdout: "",
        stderr: `Tool definition not found for '${tool.tool_id}'.`,
        duration_ms: 0,
      };
      await this.writeRecord(request, result, context);
      return result;
    }

    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    // Pre-write pending record
    const pendingRecord = this.buildRecord(
      request,
      context,
      startedAt,
      startedAt,
      0,
      "pending",
      "",
      "",
      null,
    );
    await Promise.resolve(this.opts.persistHook?.(pendingRecord));

    try {
      let result: ToolResult;
      switch (definition.source_type) {
        case "local_executable":
          result = await this.runLocalExecutable(definition, context.sanitized_args, tool.timeout_ms);
          break;
        case "http_endpoint":
          result = await this.runHttpEndpoint(definition, context.sanitized_args, tool.timeout_ms);
          break;
        case "docker_image":
          result = {
            exit_status: "error",
            stdout: "",
            stderr: `Docker execution not implemented for '${tool.tool_id}'.`,
            duration_ms: Date.now() - startTime,
          };
          break;
        default:
          result = {
            exit_status: "error",
            stdout: "",
            stderr: `Unknown source_type for '${tool.tool_id}'.`,
            duration_ms: Date.now() - startTime,
          };
      }

      await this.writeRecord(request, result, context, startedAt);
      return result;
    } catch (error) {
      const result: ToolResult = {
        exit_status: "error",
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
        duration_ms: Date.now() - startTime,
      };
      await this.writeRecord(request, result, context, startedAt);
      return result;
    }
  }

  private async runLocalExecutable(
    definition: ToolDefinition,
    args: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<ToolResult> {
    const executable = definition.executable_path;
    if (!executable) {
      return {
        exit_status: "error",
        stdout: "",
        stderr: "Missing executable_path in tool definition.",
        duration_ms: 0,
      };
    }

    return new Promise((resolve) => {
      const start = Date.now();
      const child = spawn(executable, [JSON.stringify(args)], {
        cwd: definition.working_directory ?? definition.repo_root ?? process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let killed = false;

      const timer = setTimeout(() => {
        killed = true;
        child.kill("SIGTERM");
        // Hard kill after grace period
        setTimeout(() => child.kill("SIGKILL"), 5000);
      }, timeoutMs);

      child.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString("utf-8");
      });

      child.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString("utf-8");
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        resolve({
          exit_status: "error",
          stdout,
          stderr: err.message,
          duration_ms: Date.now() - start,
        });
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        const duration = Date.now() - start;
        if (killed) {
          resolve({
            exit_status: "timeout",
            stdout,
            stderr: stderr || `Tool timed out after ${timeoutMs}ms`,
            duration_ms: duration,
          });
        } else if (code !== 0) {
          resolve({
            exit_status: "error",
            stdout,
            stderr: stderr || `Process exited with code ${code}`,
            duration_ms: duration,
          });
        } else {
          let structured: Record<string, unknown> | undefined;
          try {
            structured = JSON.parse(stdout) as Record<string, unknown>;
          } catch {
            // Not JSON — leave stdout as-is
          }
          resolve({
            exit_status: "success",
            stdout,
            stderr,
            structured_output: structured,
            duration_ms: duration,
          });
        }
      });
    });
  }

  private async runHttpEndpoint(
    definition: ToolDefinition,
    args: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<ToolResult> {
    const url = definition.url;
    if (!url) {
      return {
        exit_status: "error",
        stdout: "",
        stderr: "Missing url in tool definition.",
        duration_ms: 0,
      };
    }

    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const duration = Date.now() - start;
      const text = await response.text();

      if (!response.ok) {
        return {
          exit_status: "error",
          stdout: "",
          stderr: `HTTP ${response.status}: ${text}`,
          duration_ms: duration,
        };
      }

      let structured: Record<string, unknown> | undefined;
      try {
        structured = JSON.parse(text) as Record<string, unknown>;
      } catch {
        // Not JSON
      }

      return {
        exit_status: "success",
        stdout: text,
        stderr: "",
        structured_output: structured,
        duration_ms: duration,
      };
    } catch (err) {
      clearTimeout(timer);
      const duration = Date.now() - start;
      if (err instanceof Error && err.name === "AbortError") {
        return {
          exit_status: "timeout",
          stdout: "",
          stderr: `HTTP request timed out after ${timeoutMs}ms`,
          duration_ms: duration,
        };
      }
      return {
        exit_status: "error",
        stdout: "",
        stderr: err instanceof Error ? err.message : String(err),
        duration_ms: duration,
      };
    }
  }

  private async writeRecord(
    request: ToolInvocationRequest,
    result: ToolResult,
    context: {
      execution_id: string;
      work_item_id: string;
      conversation_id: string;
      sanitized_args: Record<string, unknown>;
    },
    startedAt?: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    const record = this.buildRecord(
      request,
      context,
      startedAt ?? now,
      now,
      result.duration_ms,
      result.exit_status,
      result.stdout,
      result.stderr,
      result.structured_output ? JSON.stringify(result.structured_output) : null,
    );
    await Promise.resolve(this.opts.persistHook?.(record));
  }

  private buildRecord(
    request: ToolInvocationRequest,
    context: {
      execution_id: string;
      work_item_id: string;
      conversation_id: string;
      sanitized_args: Record<string, unknown>;
    },
    startedAt: string,
    completedAt: string,
    durationMs: number,
    exitStatus: ToolCallRecord["exit_status"],
    stdout: string,
    stderr: string,
    structuredOutputJson: string | null,
  ): ToolCallRecord {
    return {
      call_id: `tc_${context.execution_id}_${Date.now()}`,
      execution_id: context.execution_id,
      work_item_id: context.work_item_id,
      conversation_id: context.conversation_id,
      tool_id: request.tool_id,
      request_args_json: JSON.stringify(context.sanitized_args),
      exit_status: exitStatus,
      stdout,
      stderr,
      structured_output_json: structuredOutputJson,
      started_at: startedAt,
      completed_at: completedAt,
      duration_ms: durationMs,
    };
  }
}
