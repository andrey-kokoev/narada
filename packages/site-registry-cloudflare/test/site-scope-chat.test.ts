import { describe, expect, it } from "vitest";
import {
  SITE_SCOPE_PROJECTED_CHAT_TOOLS,
  respondToSiteScopeProjectedChat,
  type SiteScopeProjectedChatRequest,
} from "../src/site-scope-chat.js";

function chatRequest(overrides: Partial<SiteScopeProjectedChatRequest> = {}): SiteScopeProjectedChatRequest {
  return {
    schema: "narada.site_communication.chat_request.v0",
    chat_scope: "site_projection",
    site_id: "site-a",
    projection_ref: "site-registry:site-a:projection:latest",
    operator_prompt: "What needs attention?",
    projection_context: {
      site_id: "site-a",
      projection_ref: "site-registry:site-a:projection:latest",
      freshness: "fresh",
      latest_health_status: "ok",
      latest_health_observed_at: "2026-05-17T00:00:00.000Z",
      relation: { state: "active", visibility: "public", source: "known_site", updated_at: "2026-05-17T00:00:00.000Z" },
      dashboard_rows: [
        { label: "Open tasks", value: 2, status: "attention" },
        { label: "Inbox posture", value: "quiet", status: "ok" },
      ],
      receipt_summaries: [
        { communication_id: "comm-1", delivery_status: "recorded_not_delivered", admission_status: "pending_target_site_admission" },
      ],
    },
    ...overrides,
  };
}

describe("Site-scope projected chat runtime stub", () => {
  it("requires selected Site scope and projection reference", () => {
    const response = respondToSiteScopeProjectedChat(chatRequest({
      site_id: "",
      projection_ref: "",
      operator_prompt: "",
    }));

    expect(response.response_kind).toBe("refusal");
    expect(response.reason_codes).toEqual(expect.arrayContaining([
      "chat_site_id_required",
      "chat_projection_ref_required",
      "chat_operator_prompt_required",
    ]));
    expect(response.tool_policy.direct_mutation_exposed).toBe(false);
  });

  it("answers only from the selected Site projection context", () => {
    const response = respondToSiteScopeProjectedChat(chatRequest());
    const text = JSON.stringify(response);

    expect(response.response_kind).toBe("answer");
    expect(response.site_id).toBe("site-a");
    expect(response.message).toContain("site-registry:site-a:projection:latest");
    expect(response.message).toContain("Health ok");
    expect(response.message).toContain("Relation active / public");
    expect(response.message).toContain("Open tasks: 2");
    expect(response.context_refs).toEqual(expect.arrayContaining([
      "site-registry:site-a:site-record",
      "site-registry:site-a:projection:latest",
      "site-registry:site-a:relation-lifecycle",
    ]));
    expect(text).not.toContain("site-b");
    expect(text).not.toContain("raw-token");
  });

  it("refuses cross-Site, private-data, secret, and mutation requests", () => {
    const privatePrompt = respondToSiteScopeProjectedChat(chatRequest({
      operator_prompt: "Read the task DB, raw inbox payloads, raw logs, secrets, and all sites, then close task 1.",
    }));
    const mismatch = respondToSiteScopeProjectedChat(chatRequest({
      projection_context: {
        site_id: "site-b",
        projection_ref: "site-registry:site-b:projection:latest",
      },
    }));

    expect(privatePrompt.response_kind).toBe("refusal");
    expect(privatePrompt.reason_codes).toEqual(expect.arrayContaining([
      "private_task_lifecycle_db_requested",
      "raw_inbox_payload_requested",
      "raw_logs_requested",
      "secret_access_requested",
      "cross_site_context_requested",
      "direct_mutation_requested",
    ]));
    expect(mismatch.reason_codes).toEqual(expect.arrayContaining([
      "projection_context_site_mismatch",
      "projection_context_ref_mismatch",
    ]));
  });

  it("proposes inbox envelopes without exposing direct mutation tools", () => {
    const response = respondToSiteScopeProjectedChat(chatRequest({
      requested_tool: {
        name: "compose_site_inbox_message",
        subject: "Check stale projection",
        body: "Please inspect the stale registry projection.",
        kind: "question",
      },
    }));

    expect(response.response_kind).toBe("tool_proposal");
    expect(response.proposed_tool_call?.tool_name).toBe("compose_site_inbox_message");
    expect(response.proposed_tool_call?.target_site_id).toBe("site-a");
    expect(response.proposed_tool_call?.requires_human_confirmation).toBe(true);
    expect(response.proposed_tool_call?.send_path).toBeUndefined();
    expect(response.proposed_tool_call?.request_body?.target_site_id).toBe("site-a");
    expect(response.proposed_tool_call?.request_body?.envelope.payload.composed_by).toMatchObject({
      kind: "site_scope_projected_chat",
      site_id: "site-a",
      projection_ref: "site-registry:site-a:projection:latest",
      human_confirmed_send: true,
    });
    expect(response.tool_policy.forbidden_tools).toEqual(expect.arrayContaining([
      "task_lifecycle_mutation",
      "site_config_mutation",
      "registry_relation_mutation",
      "secret_read",
      "direct_inbox_mutation",
    ]));
    expect(response.tool_policy.direct_mutation_exposed).toBe(false);
  });

  it("plans submit through the shared Site communication API only", () => {
    const response = respondToSiteScopeProjectedChat(chatRequest({
      requested_tool: {
        name: "submit_site_inbox_message",
        subject: "Check projection",
        body: "Please inspect projection freshness.",
        delivery_endpoint: {
          kind: "site_inbox_http",
          url: "https://site-a.example/inbox",
          capability_ref: "capability:site-a.inbox.submit",
        },
      },
    }));
    const text = JSON.stringify(response);

    expect(response.response_kind).toBe("send_plan");
    expect(response.proposed_tool_call?.send_path).toEqual({
      method: "POST",
      path: "/api/site-communications/send",
    });
    expect(response.proposed_tool_call?.request_body?.schema).toBe("narada.site_registry.outbound_communication.send.v0");
    expect(response.proposed_tool_call?.request_body?.delivery_endpoint).toMatchObject({
      url: "https://site-a.example/inbox",
      capability_ref: "capability:site-a.inbox.submit",
    });
    expect(response.message).toContain("Delivery is not target Site admission");
    expect(text).not.toContain("message-token");
    expect(text).not.toContain("Bearer");
  });

  it("declares only compose and shared-api send tools", () => {
    expect(SITE_SCOPE_PROJECTED_CHAT_TOOLS.map((tool) => tool.name)).toEqual([
      "compose_site_inbox_message",
      "submit_site_inbox_message",
    ]);
    expect(SITE_SCOPE_PROJECTED_CHAT_TOOLS.find((tool) => tool.name === "submit_site_inbox_message")?.route)
      .toEqual({ method: "POST", path: "/api/site-communications/send" });
    expect(JSON.stringify(SITE_SCOPE_PROJECTED_CHAT_TOOLS)).not.toContain("message-token");
    expect(JSON.stringify(SITE_SCOPE_PROJECTED_CHAT_TOOLS)).not.toContain("Bearer");
  });
});
