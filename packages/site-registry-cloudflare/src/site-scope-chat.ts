export type SiteScopeProjectedChatToolName = "compose_site_inbox_message" | "submit_site_inbox_message";

export interface SiteScopeProjectedChatToolSchema {
  name: SiteScopeProjectedChatToolName;
  authority: "proposal_only" | "shared_api_only";
  route?: {
    method: "POST";
    path: "/api/site-communications/send";
  };
  requires_human_confirmation: boolean;
  forbidden_effects: string[];
}

export const SITE_SCOPE_PROJECTED_CHAT_TOOLS: SiteScopeProjectedChatToolSchema[] = [
  {
    name: "compose_site_inbox_message",
    authority: "proposal_only",
    requires_human_confirmation: true,
    forbidden_effects: [
      "direct_target_site_inbox_mutation",
      "task_lifecycle_mutation",
      "site_config_mutation",
      "secret_read",
    ],
  },
  {
    name: "submit_site_inbox_message",
    authority: "shared_api_only",
    route: { method: "POST", path: "/api/site-communications/send" },
    requires_human_confirmation: true,
    forbidden_effects: [
      "direct_target_site_inbox_mutation",
      "task_lifecycle_mutation",
      "site_config_mutation",
      "registry_relation_mutation",
      "secret_read",
    ],
  },
];

export interface SiteScopeProjectedChatProjectionContext {
  site_id: string;
  projection_ref: string;
  freshness?: string;
  latest_health_status?: string;
  latest_health_observed_at?: string;
  relation?: {
    state?: string;
    visibility?: string;
    source?: string;
    updated_at?: string;
  };
  dashboard_rows?: Array<{
    label: string;
    value: string | number | boolean | null;
    status?: string;
  }>;
  receipt_summaries?: Array<{
    communication_id: string;
    delivery_status: string;
    admission_status: string;
  }>;
}

export interface SiteScopeProjectedChatRequest {
  schema: "narada.site_communication.chat_request.v0";
  chat_scope: "site_projection";
  site_id: string;
  projection_ref: string;
  operator_prompt: string;
  projection_context: SiteScopeProjectedChatProjectionContext;
  requested_tool?: {
    name: SiteScopeProjectedChatToolName;
    subject?: string;
    body?: string;
    kind?: string;
    delivery_endpoint?: {
      kind: "site_inbox_http" | "canonical_inbox_endpoint" | string;
      url?: string;
      capability_ref?: string;
    };
    idempotency_key?: string;
  };
}

export type SiteScopeProjectedChatResponseKind = "answer" | "tool_proposal" | "send_plan" | "refusal";

export interface SiteScopeProjectedChatResponse {
  schema: "narada.site_communication.chat_response.v0";
  site_id: string;
  projection_ref?: string;
  response_kind: SiteScopeProjectedChatResponseKind;
  message: string;
  reason_codes: string[];
  context_refs: string[];
  tool_policy: {
    allowed_tools: SiteScopeProjectedChatToolName[];
    forbidden_tools: string[];
    direct_mutation_exposed: false;
  };
  proposed_tool_call?: {
    tool_name: SiteScopeProjectedChatToolName;
    target_site_id: string;
    requires_human_confirmation: true;
    send_path?: {
      method: "POST";
      path: "/api/site-communications/send";
    };
    request_body?: {
      schema: "narada.site_registry.outbound_communication.send.v0";
      target_site_id: string;
      source: { kind: "site_scope_projected_chat"; ref: string };
      idempotency_key: string;
      envelope: {
        schema: "narada.site_inbox.typed_envelope.v0";
        kind: string;
        subject: string;
        body: string;
        payload: {
          schema: "narada.site_communication.operator_message_payload.v0";
          related_projection_ref: string;
          composed_by: {
            kind: "site_scope_projected_chat";
            site_id: string;
            projection_ref: string;
            human_confirmed_send: true;
          };
        };
        evidence_refs: string[];
        authority_limits: string[];
      };
      delivery_endpoint?: NonNullable<SiteScopeProjectedChatRequest["requested_tool"]>["delivery_endpoint"];
      evidence_refs: string[];
    };
  };
  authority_limits: string[];
}

const CHAT_AUTHORITY_LIMITS = [
  "chat_context_is_site_projection_only",
  "chat_cannot_read_private_site_substrate",
  "chat_cannot_mutate_site_state",
  "chat_can_only_compose_or_send_shared_site_communication",
];

const FORBIDDEN_TOOLS = [
  "task_lifecycle_mutation",
  "site_config_mutation",
  "registry_relation_mutation",
  "secret_read",
  "direct_inbox_mutation",
];

const PRIVATE_CONTEXT_PATTERNS: Array<[RegExp, string]> = [
  [/\b(task db|task lifecycle|sqlite|private task)\b/i, "private_task_lifecycle_db_requested"],
  [/\b(raw inbox|inbox payload|canonical inbox)\b/i, "raw_inbox_payload_requested"],
  [/\b(secrets?|tokens?|bearer|credentials?|api keys?)\b/i, "secret_access_requested"],
  [/\b(raw logs?|runtime traces?|stack traces?)\b/i, "raw_logs_requested"],
  [/\b(filesystem|local file|unexported file)\b/i, "unexported_filesystem_state_requested"],
  [/\b(all sites|other site|another site|cross-site|registry-wide)\b/i, "cross_site_context_requested"],
  [/\b(mutate|execute|close task|claim task|change config|grant capability|rotate secret)\b/i, "direct_mutation_requested"],
];

export function respondToSiteScopeProjectedChat(request: SiteScopeProjectedChatRequest): SiteScopeProjectedChatResponse {
  const validationRefusals = validateChatRequest(request);
  if (validationRefusals.length > 0) {
    return refusalResponse(request, validationRefusals);
  }

  const promptRefusals = forbiddenPromptReasons(request.operator_prompt);
  if (promptRefusals.length > 0) {
    return refusalResponse(request, promptRefusals);
  }

  if (request.requested_tool) {
    return toolResponse(request);
  }

  const context = request.projection_context;
  const relationState = context.relation?.state ?? "not projected";
  const relationVisibility = context.relation?.visibility ?? "not projected";
  const dashboardSummary = (context.dashboard_rows ?? [])
    .slice(0, 3)
    .map((row) => `${row.label}: ${String(row.value)}`)
    .join("; ");
  const receipts = (context.receipt_summaries ?? [])
    .slice(0, 2)
    .map((receipt) => `${receipt.communication_id} delivery=${receipt.delivery_status} admission=${receipt.admission_status}`)
    .join("; ");
  const parts = [
    `Projection ${request.projection_ref} for ${request.site_id}.`,
    `Health ${context.latest_health_status ?? "not projected"}; freshness ${context.freshness ?? "not projected"}.`,
    `Relation ${relationState} / ${relationVisibility}.`,
  ];
  if (dashboardSummary) parts.push(`Dashboard ${dashboardSummary}.`);
  if (receipts) parts.push(`Receipts ${receipts}.`);
  parts.push("I can only use this selected Site projection and can only compose Site inbox messages through the shared communication API.");

  return baseResponse(request, "answer", parts.join(" "), []);
}

function toolResponse(request: SiteScopeProjectedChatRequest): SiteScopeProjectedChatResponse {
  const tool = request.requested_tool;
  if (!tool) return refusalResponse(request, ["chat_tool_request_missing"]);
  const schema = SITE_SCOPE_PROJECTED_CHAT_TOOLS.find((candidate) => candidate.name === tool.name);
  if (!schema) return refusalResponse(request, ["chat_tool_not_allowed"]);

  const subject = boundedText(tool.subject, "Site projection follow-up", 180);
  const body = boundedText(tool.body ?? request.operator_prompt, request.operator_prompt, 12000);
  const idempotencyKey = tool.idempotency_key ?? `site-scope-chat:${request.site_id}:${stableTextKey(subject)}:${stableTextKey(body)}`;
  const requestBody = {
    schema: "narada.site_registry.outbound_communication.send.v0" as const,
    target_site_id: request.site_id,
    source: {
      kind: "site_scope_projected_chat" as const,
      ref: `site-scope-chat:${request.site_id}:${request.projection_ref}`,
    },
    idempotency_key: idempotencyKey,
    envelope: {
      schema: "narada.site_inbox.typed_envelope.v0" as const,
      kind: tool.kind ?? "operator_message",
      subject,
      body,
      payload: {
        schema: "narada.site_communication.operator_message_payload.v0" as const,
        related_projection_ref: request.projection_ref,
        composed_by: {
          kind: "site_scope_projected_chat" as const,
          site_id: request.site_id,
          projection_ref: request.projection_ref,
          human_confirmed_send: true as const,
        },
      },
      evidence_refs: [`site-scope-chat:${request.site_id}`],
      authority_limits: [
        "target_site_admission_required",
        "chat_can_only_compose_or_send_this_candidate",
        "registry_delivery_is_not_local_admission",
      ],
    },
    delivery_endpoint: tool.delivery_endpoint,
    evidence_refs: [`site-scope-chat:${request.site_id}`],
  };
  const responseKind = tool.name === "submit_site_inbox_message" ? "send_plan" : "tool_proposal";
  return {
    ...baseResponse(request, responseKind, toolMessage(tool.name), []),
    proposed_tool_call: {
      tool_name: tool.name,
      target_site_id: request.site_id,
      requires_human_confirmation: true,
      send_path: tool.name === "submit_site_inbox_message"
        ? { method: "POST", path: "/api/site-communications/send" }
        : undefined,
      request_body: requestBody,
    },
  };
}

function validateChatRequest(request: SiteScopeProjectedChatRequest): string[] {
  const reasons: string[] = [];
  if (request.schema !== "narada.site_communication.chat_request.v0") reasons.push("chat_schema_invalid");
  if (request.chat_scope !== "site_projection") reasons.push("chat_scope_must_be_site_projection");
  if (!request.site_id) reasons.push("chat_site_id_required");
  if (!request.projection_ref) reasons.push("chat_projection_ref_required");
  if (!request.operator_prompt) reasons.push("chat_operator_prompt_required");
  if (!request.projection_context) reasons.push("chat_projection_context_required");
  if (request.projection_context?.site_id && request.projection_context.site_id !== request.site_id) {
    reasons.push("projection_context_site_mismatch");
  }
  if (request.projection_context?.projection_ref && request.projection_context.projection_ref !== request.projection_ref) {
    reasons.push("projection_context_ref_mismatch");
  }
  return reasons;
}

function forbiddenPromptReasons(prompt: string): string[] {
  const reasons = new Set<string>();
  for (const [pattern, reason] of PRIVATE_CONTEXT_PATTERNS) {
    if (pattern.test(prompt)) reasons.add(reason);
  }
  return [...reasons];
}

function refusalResponse(request: SiteScopeProjectedChatRequest, reasonCodes: string[]): SiteScopeProjectedChatResponse {
  return baseResponse(
    request,
    "refusal",
    `I can answer only from the published projection for ${request.site_id || "the selected Site"}.`,
    reasonCodes,
  );
}

function baseResponse(
  request: SiteScopeProjectedChatRequest,
  responseKind: SiteScopeProjectedChatResponseKind,
  message: string,
  reasonCodes: string[],
): SiteScopeProjectedChatResponse {
  return {
    schema: "narada.site_communication.chat_response.v0",
    site_id: request.site_id,
    projection_ref: request.projection_ref,
    response_kind: responseKind,
    message,
    reason_codes: reasonCodes,
    context_refs: [
      `site-registry:${request.site_id}:site-record`,
      request.projection_ref,
      `site-registry:${request.site_id}:relation-lifecycle`,
    ],
    tool_policy: {
      allowed_tools: SITE_SCOPE_PROJECTED_CHAT_TOOLS.map((tool) => tool.name),
      forbidden_tools: [...FORBIDDEN_TOOLS],
      direct_mutation_exposed: false,
    },
    authority_limits: [...CHAT_AUTHORITY_LIMITS],
  };
}

function boundedText(value: string | undefined, fallback: string, maxLength: number): string {
  const normalized = (value ?? fallback).trim();
  return normalized.length <= maxLength ? normalized : normalized.slice(0, maxLength);
}

function stableTextKey(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return normalized.slice(0, 48) || "message";
}

function toolMessage(toolName: SiteScopeProjectedChatToolName): string {
  if (toolName === "submit_site_inbox_message") {
    return "Prepared a shared Site communication API send plan. Delivery is not target Site admission.";
  }
  return "Prepared a Site inbox message candidate for operator confirmation.";
}
