/**
 * Litmus Graph Shim
 *
 * Intercepts globalThis.fetch for Microsoft Graph URLs and serves them from
 * an in-process fake mailbox, so the stock daemon outbound workers
 * (SendReplyWorker / SendExecutionWorker / NonSendWorker / reconciler) run
 * unchanged against a litmus sandbox instead of graph.microsoft.com.
 *
 * Artifact mapping (SPEC §2):
 * - POST /users/:uid/messages            (createDraft)  -> drafts.jsonl line
 * - POST /users/:uid/messages/:id/send   (sendDraft)    -> outbox.jsonl line
 * - GET  /users/:uid/messages/:id                       -> stored draft, or
 *   the inbox message view for reply-quote reads
 * - GET  /users/:uid/messages?$filter=...               -> { value: [] }
 *
 * Draft state persists to <sandbox>/state/litmus-graph.json so restarts
 * within a run keep previously created drafts. Timestamps on artifact lines
 * are virtual ticks read from the sandbox clock file, never wall-clock.
 *
 * Non-Graph URLs are passed through to the real fetch.
 */

import { createHash } from "node:crypto";
import { appendFileSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

// node:sqlite has no type declarations in this toolchain's @types/node;
// require it and bind a minimal structural interface instead.
const require = createRequire(import.meta.url);
interface LitmusSqliteStatement {
  get(...args: unknown[]): unknown;
}
interface LitmusSqliteDatabase {
  prepare(sql: string): LitmusSqliteStatement;
  close(): void;
}
const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: new (path: string, options?: { readOnly?: boolean }) => LitmusSqliteDatabase;
};

export interface LitmusGraphShimOptions {
  /** Absolute path of the litmus sandbox directory */
  sandboxDir: string;
  /**
   * Absolute path of the daemon's coordinator.db (read-only joins for
   * drafts.jsonl work_id / conversation_id / origin fields).
   */
  coordinatorDbPath?: string;
}

interface StoredDraft {
  id: string;
  subject?: string;
  body?: { contentType: string; content: string };
  toRecipients?: unknown[];
  ccRecipients?: unknown[];
  bccRecipients?: unknown[];
  internetMessageHeaders?: Array<{ name: string; value: string }>;
  internetMessageId?: string;
  sent: boolean;
}

interface ShimState {
  drafts: Record<string, StoredDraft>;
}

const GRAPH_PREFIX = "https://graph.microsoft.com";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function installLitmusGraphShim(opts: LitmusGraphShimOptions): { restore: () => void } {
  const sandboxDir = opts.sandboxDir;
  const statePath = join(sandboxDir, "state", "litmus-graph.json");
  const draftsPath = join(sandboxDir, "drafts.jsonl");
  const outboxPath = join(sandboxDir, "outbox.jsonl");
  const inboxPath = join(sandboxDir, "inbox.jsonl");
  const clockPath = join(sandboxDir, "clock");

  function readTick(): number {
    try {
      const parsed = JSON.parse(readFileSync(clockPath, "utf8")) as { tick?: number };
      return parsed.tick ?? 0;
    } catch {
      return 0;
    }
  }

  function loadState(): ShimState {
    try {
      const parsed = JSON.parse(readFileSync(statePath, "utf8")) as ShimState;
      return { drafts: parsed.drafts ?? {} };
    } catch {
      return { drafts: {} };
    }
  }

  function saveState(state: ShimState): void {
    mkdirSync(dirname(statePath), { recursive: true });
    writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", "utf8");
  }

  const state = loadState();

  /**
   * Read-only join against the daemon's coordinator.db to resolve the
   * litmus-facing identity of a draft (SPEC §2 drafts.jsonl fields):
   * - work_id: the inbox message id the reply targets (harness work item)
   * - conversation_id: the Narada context id (litmus conversation)
   * - origin: stub call ids from the litmus_origin fact the model proxy
   *   embeds in the charter output, else "model-free"
   * Every step degrades to a safe fallback when the db is missing, locked,
   * or the join finds nothing.
   */
  function resolveDraftContext(outboundId: string): {
    work_id: string;
    conversation_id: string | null;
    origin: string | string[];
  } {
    const fallback = { work_id: outboundId, conversation_id: null, origin: "model-free" as string | string[] };
    if (!opts.coordinatorDbPath) return fallback;
    let db: LitmusSqliteDatabase | undefined;
    try {
      db = new DatabaseSync(opts.coordinatorDbPath, { readOnly: true });

      const version = db.prepare(
        "select reply_to_message_id from outbound_versions where outbound_id = ? order by version asc limit 1",
      ).get(outboundId) as { reply_to_message_id: string | null } | undefined;
      const workId = version?.reply_to_message_id ?? outboundId;

      const handoff = db.prepare(
        "select context_id from outbound_handoffs where outbound_id = ?",
      ).get(outboundId) as { context_id: string } | undefined;
      const conversationId = handoff?.context_id ?? null;

      let origin: string | string[] = "model-free";
      const decision = db.prepare(
        "select decision_id from foreman_decisions where outbound_id = ?",
      ).get(outboundId) as { decision_id: string } | undefined;
      const workItemId = decision?.decision_id
        ?.replace(/^fd_/, "")
        .replace(/_(draft_reply|send_reply|send_new_message)$/, "");
      if (workItemId) {
        const evaluation = db.prepare(
          "select facts_json from evaluations where work_item_id = ? order by created_at desc limit 1",
        ).get(workItemId) as { facts_json: string } | undefined;
        if (evaluation) {
          try {
            const facts = JSON.parse(evaluation.facts_json) as Array<{ kind?: string; value_json?: string }>;
            const callIds = facts
              .filter((f) => f.kind === "litmus_origin")
              .map((f) => {
                try {
                  return (JSON.parse(f.value_json ?? "{}") as { stub_call_id?: string }).stub_call_id;
                } catch {
                  return undefined;
                }
              })
              .filter((id): id is string => typeof id === "string");
            if (callIds.length > 0) origin = callIds;
          } catch {
            // keep fallback origin
          }
        }
      }

      return { work_id: workId, conversation_id: conversationId, origin };
    } catch {
      return fallback;
    } finally {
      try {
        db?.close();
      } catch {
        // ignore close errors
      }
    }
  }

  function readInboxMessages(): Array<Record<string, unknown>> {
    try {
      const out: Array<Record<string, unknown>> = [];
      const lines = readFileSync(inboxPath, "utf8").split("\n").filter((l) => l.trim() !== "");
      for (const line of lines) {
        try {
          out.push(JSON.parse(line) as Record<string, unknown>);
        } catch {
          // skip unparseable line
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  function findInboxMessage(messageId: string): Record<string, unknown> | null {
    return readInboxMessages().find((msg) => msg.id === messageId) ?? null;
  }

  function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }

  function graphError(status: number, code: string, message: string): Response {
    return jsonResponse(status, { error: { code, message } });
  }

  function handleGraph(url: string, init?: RequestInit): Response {
    const parsed = new URL(url);
    const path = parsed.pathname; // e.g. /v1.0/users/:uid/messages/:id/send
    const method = (init?.method ?? "GET").toUpperCase();

    // Strip /v1.0/users/:uid prefix
    const m = path.match(/^\/v1\.0\/users\/[^/]+(\/.*)?$/);
    if (!m) {
      return graphError(404, "UnknownSegment", `Unrecognized Graph path: ${path}`);
    }
    const rest = m[1] ?? "/";

    // POST /messages -> create draft
    if (method === "POST" && rest === "/messages") {
      const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      const headers = (payload.internetMessageHeaders ?? []) as Array<{ name: string; value: string }>;
      const outboundId = headers.find((h) => h.name.toLowerCase() === "x-outbound-id")?.value ?? "unknown";
      const draftId = `litmus-draft-${sha256(outboundId).slice(0, 16)}`;

      const existing = state.drafts[draftId];
      if (!existing) {
        const body = payload.body as { contentType?: string; content?: string } | undefined;
        const content = body?.content ?? "";
        const draft: StoredDraft = {
          id: draftId,
          subject: (payload.subject as string | undefined) ?? "",
          body: { contentType: body?.contentType ?? "Text", content },
          toRecipients: (payload.toRecipients as unknown[]) ?? [],
          ccRecipients: (payload.ccRecipients as unknown[]) ?? [],
          bccRecipients: (payload.bccRecipients as unknown[]) ?? [],
          internetMessageHeaders: headers,
          internetMessageId: `<${draftId}@litmus.local>`,
          sent: false,
        };
        state.drafts[draftId] = draft;
        saveState(state);

        // SPEC §2 drafts.jsonl: declare before send. work_id is the inbox
        // message id (the harness's work item), origin traces to stub calls.
        const ctx = resolveDraftContext(outboundId);
        appendFileSync(draftsPath, JSON.stringify({
          draft_id: draftId,
          work_id: ctx.work_id,
          conversation_id: ctx.conversation_id,
          body: content,
          content_hash: `sha256:${sha256(content)}`,
          declared_at: readTick(),
          origin: ctx.origin,
        }) + "\n");
      }

      return jsonResponse(201, { id: draftId });
    }

    // POST /messages/:id/send -> send draft
    const sendMatch = rest.match(/^\/messages\/([^/]+)\/send$/);
    if (method === "POST" && sendMatch) {
      const draftId = decodeURIComponent(sendMatch[1]!);
      const draft = state.drafts[draftId];
      if (!draft) {
        return graphError(404, "ErrorItemNotFound", `Draft not found: ${draftId}`);
      }
      if (!draft.sent) {
        draft.sent = true;
        saveState(state);
        appendFileSync(outboxPath, JSON.stringify({
          effect_id: `fx-${sha256(`${draftId}:send`).slice(0, 16)}`,
          draft_id: draftId,
          sent_at: readTick(),
        }) + "\n");
      }
      return new Response(null, { status: 202 });
    }

    // GET /messages/:id -> stored draft, or inbox message view (reply quote)
    const getMatch = rest.match(/^\/messages\/([^/]+)$/);
    if (method === "GET" && getMatch) {
      const messageId = decodeURIComponent(getMatch[1]!);
      const draft = state.drafts[messageId];
      if (draft) {
        return jsonResponse(200, {
          id: draft.id,
          subject: draft.subject,
          body: draft.body,
          toRecipients: draft.toRecipients,
          ccRecipients: draft.ccRecipients,
          bccRecipients: draft.bccRecipients,
          internetMessageHeaders: draft.internetMessageHeaders,
          internetMessageId: draft.internetMessageId,
          isRead: false,
        });
      }
      const inboxMsg = findInboxMessage(messageId);
      if (inboxMsg) {
        const from = typeof inboxMsg.from === "string" ? inboxMsg.from : "";
        return jsonResponse(200, {
          id: messageId,
          subject: inboxMsg.subject ?? "",
          receivedDateTime: new Date(1_700_000_000_000 + ((inboxMsg.at as number) ?? 0) * 1000).toISOString(),
          from: { emailAddress: { name: from, address: from } },
          sender: { emailAddress: { name: from, address: from } },
          toRecipients: [],
          ccRecipients: [],
          body: { contentType: "text", content: (inboxMsg.body as string) ?? "" },
          isRead: false,
        });
      }
      return graphError(404, "ErrorItemNotFound", `Message not found: ${messageId}`);
    }

    // GET /messages?$filter=... -> participant/finder probes.
    // conversationId filters are served from inbox.jsonl so the stock
    // participant resolver recognizes thread participants; other filters
    // (internetMessageHeaders/internetMessageId lookups) return empty.
    if (method === "GET" && rest === "/messages") {
      const filter = parsed.searchParams.get("$filter") ?? "";
      const convMatch = filter.match(/conversationId\s+eq\s+'([^']+)'/);
      if (convMatch) {
        const convId = convMatch[1];
        const value = readInboxMessages()
          .filter((msg) => msg.conversation_id === convId)
          .map((msg) => {
            const from = typeof msg.from === "string" ? msg.from : "";
            return {
              id: msg.id,
              from: { emailAddress: { name: from, address: from } },
              toRecipients: [],
              ccRecipients: [],
              bccRecipients: [],
            };
          });
        return jsonResponse(200, { value });
      }
      return jsonResponse(200, { value: [] });
    }

    return graphError(404, "UnknownSegment", `Unhandled Graph request: ${method} ${path}`);
  }

  const realFetch = globalThis.fetch;
  const shimmed = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(GRAPH_PREFIX)) {
      return handleGraph(url, init);
    }
    return realFetch(input, init);
  }) as typeof fetch;

  globalThis.fetch = shimmed;

  return {
    restore: () => {
      if (globalThis.fetch === shimmed) {
        globalThis.fetch = realFetch;
      }
    },
  };
}
