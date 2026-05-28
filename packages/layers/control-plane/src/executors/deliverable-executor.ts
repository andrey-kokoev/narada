/**
 * Deliverable Executor
 *
 * Consumes deliverable.create intents and writes local markdown artifacts.
 */

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { IntentStore } from "../intent/store.js";
import type { ProcessExecutionStore } from "./store.js";
import type { Logger } from "../logging/types.js";

export interface CreateDeliverablePayload {
  operation_slug: string;
  deliverable_type: string;
  title: string;
  body_markdown: string;
  source_message_ids: string[];
  source_attachment_names?: string[];
}

export interface DeliverableExecutorDeps {
  intentStore: IntentStore;
  executionStore: ProcessExecutionStore;
  siteRootDir: string;
  logger?: Logger;
}

function sanitizeSegment(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/^staccato-/, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "deliverable";
}

function validatePayload(payload: unknown): CreateDeliverablePayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Payload must be an object");
  }
  const p = payload as Record<string, unknown>;
  const requiredStrings = ["operation_slug", "deliverable_type", "title", "body_markdown"];
  for (const key of requiredStrings) {
    if (typeof p[key] !== "string" || p[key].trim().length === 0) {
      throw new Error(`Missing required field: ${key}`);
    }
  }
  if (!Array.isArray(p.source_message_ids) || p.source_message_ids.length === 0) {
    throw new Error("Missing required field: source_message_ids");
  }
  return {
    operation_slug: p.operation_slug as string,
    deliverable_type: p.deliverable_type as string,
    title: p.title as string,
    body_markdown: p.body_markdown as string,
    source_message_ids: p.source_message_ids.map(String),
    source_attachment_names: Array.isArray(p.source_attachment_names)
      ? p.source_attachment_names.map(String)
      : [],
  };
}

function renderMarkdown(payload: CreateDeliverablePayload): string {
  const sourceAttachments = payload.source_attachment_names ?? [];
  return [
    "---",
    `operation_slug: ${payload.operation_slug}`,
    `deliverable_type: ${payload.deliverable_type}`,
    `title: ${JSON.stringify(payload.title)}`,
    `source_message_ids: ${JSON.stringify(payload.source_message_ids)}`,
    `source_attachment_names: ${JSON.stringify(sourceAttachments)}`,
    "---",
    "",
    `# ${payload.title}`,
    "",
    payload.body_markdown.trim(),
    "",
  ].join("\n");
}

export class DeliverableExecutor {
  constructor(private readonly deps: DeliverableExecutorDeps) {}

  async processNext(): Promise<{ processed: boolean; executionId?: string }> {
    const pending = this.deps.intentStore.getPendingIntents("deliverable");
    const candidate = pending.find((intent) => intent.intent_type === "deliverable.create");

    if (!candidate) {
      return { processed: false };
    }

    let payload: CreateDeliverablePayload;
    try {
      payload = validatePayload(JSON.parse(candidate.payload_json));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.deps.intentStore.updateStatus(candidate.intent_id, "failed_terminal", {
        terminal_reason: message,
      });
      return { processed: true };
    }

    const operationDir = sanitizeSegment(payload.operation_slug);
    const titleSlug = sanitizeSegment(payload.title);
    const payloadHash = createHash("sha256")
      .update(candidate.payload_json)
      .digest("hex")
      .slice(0, 12);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const artifactDir = join(this.deps.siteRootDir, ".narada", "operations", operationDir, "working", "deliverables");
    const artifactPath = join(artifactDir, `${timestamp}-${titleSlug}-${payloadHash}.md`);
    const executionId = `de_${candidate.intent_id}_${Date.now()}`;
    const now = new Date().toISOString();

    this.deps.executionStore.create({
      execution_id: executionId,
      intent_id: candidate.intent_id,
      executor_family: "deliverable",
      phase: "pending",
      confirmation_status: "unconfirmed",
      command: "create_deliverable",
      args_json: JSON.stringify([]),
      cwd: this.deps.siteRootDir,
      env_json: null,
      status: "pending",
      exit_code: null,
      stdout: "",
      stderr: "",
      started_at: null,
      completed_at: null,
      confirmed_at: null,
      error_message: null,
      artifact_id: null,
      result_json: JSON.stringify({ artifact_path: artifactPath }),
      lease_expires_at: null,
      lease_runner_id: null,
    });

    this.deps.intentStore.updateStatus(candidate.intent_id, "executing", { target_id: executionId });
    this.deps.executionStore.updateStatus(executionId, "running", {
      phase: "running",
      started_at: now,
    });

    try {
      await mkdir(artifactDir, { recursive: true });
      await writeFile(artifactPath, renderMarkdown(payload), "utf8");
      const completedAt = new Date().toISOString();

      this.deps.executionStore.updateStatus(executionId, "completed", {
        phase: "completed",
        exit_code: 0,
        completed_at: completedAt,
        artifact_id: artifactPath,
        result_json: JSON.stringify({
          artifact_path: artifactPath,
          operation_slug: payload.operation_slug,
          deliverable_type: payload.deliverable_type,
        }),
      });
      this.deps.intentStore.updateStatus(candidate.intent_id, "completed");
      return { processed: true, executionId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.deps.logger?.error("Deliverable executor failed", error as Error, {
        intent_id: candidate.intent_id,
        artifact_path: artifactPath,
      });
      this.deps.executionStore.updateStatus(executionId, "failed", {
        phase: "failed",
        exit_code: -1,
        completed_at: new Date().toISOString(),
        stderr: message,
        error_message: message,
        result_json: JSON.stringify({ artifact_path: artifactPath, error: message }),
      });
      this.deps.intentStore.updateStatus(candidate.intent_id, "failed_terminal", {
        terminal_reason: message,
      });
      return { processed: true, executionId };
    }
  }
}
