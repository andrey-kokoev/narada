import { describe, it, expect } from "vitest";
import { MailboxContextStrategy } from "../../../src/foreman/mailbox/context-strategy.js";
import {
  AdmittedMailContextStrategy,
  TimerContextStrategy,
  CampaignRequestContextFormation,
  OperationIntakeContextFormation,
  resolveContextStrategy,
} from "../../../src/foreman/context.js";
import { buildMissingInformationDraftReply } from "../../../src/foreman/operation-intake.js";
import type { Fact } from "../../../src/facts/types.js";

function makeMailFact(
  conversationId: string,
  eventKind: string,
  recordId = `rec-${conversationId}`,
  senderEmail?: string,
): Omit<Fact, "created_at"> {
  const payload = {
    record_id: recordId,
    ordinal: new Date().toISOString(),
    event: {
      event_id: recordId,
      event_kind: eventKind,
      conversation_id: conversationId,
      thread_id: conversationId,
      ...(senderEmail ? { from: { email: senderEmail, display_name: "Sender" } } : {}),
    },
  };
  return {
    fact_id: `fact_mail_${conversationId}_${eventKind}_${recordId}`,
    fact_type: eventKind === "deleted" ? "mail.message.removed" : "mail.message.discovered",
    provenance: {
      source_id: "exchange:test",
      source_record_id: recordId,
      source_version: null,
      source_cursor: "cursor-1",
      observed_at: new Date().toISOString(),
    },
    payload_json: JSON.stringify(payload),
  };
}

function makeNormalizedMailFact(
  conversationId: string,
  recordId: string,
  senderEmail: string,
  options?: {
    folderRefs?: string[];
    parentFolderId?: string;
    queriedFolderRef?: string;
    to?: string[];
    cc?: string[];
    bcc?: string[];
  },
): Omit<Fact, "created_at"> {
  const graphExtensions: Record<string, string> = {};
  if (options?.parentFolderId) {
    graphExtensions.parent_folder_id = options.parentFolderId;
  }
  if (options?.queriedFolderRef) {
    graphExtensions.queried_folder_ref = options.queriedFolderRef;
  }

  const payload = {
    record_id: recordId,
    ordinal: new Date().toISOString(),
    event: {
      event_id: recordId,
      event_kind: "upsert",
      conversation_id: conversationId,
      payload: {
        conversation_id: conversationId,
        from: { email: senderEmail, display_name: "Sender" },
        sender: { email: senderEmail, display_name: "Sender" },
        to: (options?.to ?? []).map((email) => ({ email, display_name: email })),
        cc: (options?.cc ?? []).map((email) => ({ email, display_name: email })),
        bcc: (options?.bcc ?? []).map((email) => ({ email, display_name: email })),
        folder_refs: options?.folderRefs ?? [],
        ...(Object.keys(graphExtensions).length
          ? {
              source_extensions: {
                namespaces: {
                  graph: graphExtensions,
                },
              },
            }
          : {}),
      },
    },
  };
  return {
    fact_id: `fact_mail_${conversationId}_${recordId}`,
    fact_type: "mail.message.discovered",
    provenance: {
      source_id: "exchange:test",
      source_record_id: recordId,
      source_version: null,
      source_cursor: "cursor-1",
      observed_at: new Date().toISOString(),
    },
    payload_json: JSON.stringify(payload),
  };
}

function makeTimerFact(scheduleId: string, tickAt = new Date().toISOString()): Omit<Fact, "created_at"> {
  const payload = {
    record_id: `tick_${scheduleId}`,
    ordinal: tickAt,
    event: {
      kind: "timer.tick",
      schedule_id: scheduleId,
      tick_at: tickAt,
    },
  };
  return {
    fact_id: `fact_timer_${scheduleId}_${tickAt}`,
    fact_type: "timer.tick" as const,
    provenance: {
      source_id: `timer:${scheduleId}`,
      source_record_id: `tick_${scheduleId}`,
      source_version: null,
      source_cursor: "cursor-timer",
      observed_at: tickAt,
    },
    payload_json: JSON.stringify(payload),
  };
}

describe("MailboxContextStrategy", () => {
  const strategy = new MailboxContextStrategy();

  it("groups facts by conversation_id and maps event kinds", () => {
    const facts = [
      { ...makeMailFact("conv-a", "created"), created_at: new Date().toISOString() },
      { ...makeMailFact("conv-a", "deleted", "rec-2"), created_at: new Date().toISOString() },
      { ...makeMailFact("conv-b", "created"), created_at: new Date().toISOString() },
    ] as Fact[];

    const contexts = strategy.formContexts(facts, "scope-1");
    expect(contexts).toHaveLength(2);

    const ctxA = contexts.find((c) => c.context_id === "conv-a")!;
    expect(ctxA.change_kinds.sort()).toEqual(["moved", "new_message"]);
    expect(ctxA.facts).toHaveLength(2);

    const ctxB = contexts.find((c) => c.context_id === "conv-b")!;
    expect(ctxB.change_kinds).toEqual(["new_message"]);
    expect(ctxB.facts).toHaveLength(1);
  });

  it("uses getLatestRevisionOrdinal to compute ordinals", () => {
    const fact = { ...makeMailFact("conv-ord", "created"), created_at: new Date().toISOString() } as Fact;
    const contexts = strategy.formContexts([fact], "scope-1", {
      getLatestRevisionOrdinal: (id) => (id === "conv-ord" ? 3 : null),
    });

    expect(contexts[0]!.previous_revision_ordinal).toBe(3);
    expect(contexts[0]!.current_revision_ordinal).toBe(4);
    expect(contexts[0]!.revision_id).toBe("conv-ord:rev:4");
  });

  it("ignores timer facts", () => {
    const facts = [
      { ...makeTimerFact("heartbeat"), created_at: new Date().toISOString() },
    ] as Fact[];

    const contexts = strategy.formContexts(facts, "scope-1");
    expect(contexts).toHaveLength(0);
  });
});

describe("AdmittedMailContextStrategy", () => {
  it("admits mail from allowed sender domains", () => {
    const strategy = new AdmittedMailContextStrategy({
      allowed_sender_domains: ["company.com"],
      unknown_sender_behavior: "ignore",
    });

    const facts = [
      { ...makeMailFact("conv-allowed", "created", "rec-allowed", "person@company.com"), created_at: new Date().toISOString() },
      { ...makeMailFact("conv-blocked", "created", "rec-blocked", "person@example.net"), created_at: new Date().toISOString() },
    ] as Fact[];

    const contexts = strategy.formContexts(facts, "scope-1");
    expect(contexts).toHaveLength(1);
    expect(contexts[0]!.context_id).toBe("conv-allowed");
  });

  it("admits normalized mail payloads from allowed sender domains", () => {
    const strategy = new AdmittedMailContextStrategy({
      allowed_sender_domains: ["company.com"],
      unknown_sender_behavior: "ignore",
    });

    const facts = [
      { ...makeNormalizedMailFact("conv-normalized", "rec-normalized", "person@company.com"), created_at: new Date().toISOString() },
    ] as Fact[];

    const contexts = strategy.formContexts(facts, "scope-1");
    expect(contexts).toHaveLength(1);
    expect(contexts[0]!.context_id).toBe("conv-normalized");
  });

  it("admits exact sender addresses even when domain is not allowed", () => {
    const strategy = new AdmittedMailContextStrategy({
      allowed_sender_domains: ["company.com"],
      allowed_sender_addresses: ["trusted@example.net"],
      unknown_sender_behavior: "ignore",
    });

    const facts = [
      { ...makeMailFact("conv-exact", "created", "rec-exact", "trusted@example.net"), created_at: new Date().toISOString() },
    ] as Fact[];

    const contexts = strategy.formContexts(facts, "scope-1");
    expect(contexts).toHaveLength(1);
    expect(contexts[0]!.context_id).toBe("conv-exact");
  });

  it("admits mail when any configured participant domain matches a recipient", () => {
    const strategy = new AdmittedMailContextStrategy({
      predicates: {
        include: [
          {
            kind: "participant",
            fields: ["from", "sender", "to", "cc", "bcc"],
            domains: ["staccato2011.com"],
          },
        ],
        unknown_participant_behavior: "ignore",
      },
    });

    const facts = [
      {
        ...makeNormalizedMailFact("conv-recipient", "rec-recipient", "andrey@kokoev.name", {
          to: ["partner@staccato2011.com"],
        }),
        created_at: new Date().toISOString(),
      },
      {
        ...makeNormalizedMailFact("conv-blocked", "rec-blocked", "andrey@kokoev.name", {
          to: ["friend@example.net"],
        }),
        created_at: new Date().toISOString(),
      },
    ] as Fact[];

    const contexts = strategy.formContexts(facts, "scope-1");
    expect(contexts).toHaveLength(1);
    expect(contexts[0]!.context_id).toBe("conv-recipient");
  });

  it("excludes mail when an exclude participant predicate matches", () => {
    const strategy = new AdmittedMailContextStrategy({
      predicates: {
        include: [{ kind: "participant", fields: ["any_participant"], domains: ["staccato2011.com"] }],
        exclude: [{ kind: "participant", fields: ["cc"], addresses: ["blocked@staccato2011.com"] }],
        unknown_participant_behavior: "ignore",
      },
    });

    const facts = [
      {
        ...makeNormalizedMailFact("conv-excluded", "rec-excluded", "andrey@kokoev.name", {
          to: ["partner@staccato2011.com"],
          cc: ["blocked@staccato2011.com"],
        }),
        created_at: new Date().toISOString(),
      },
    ] as Fact[];

    expect(strategy.formContexts(facts, "scope-1")).toHaveLength(0);
  });

  it("admits mail only from configured folder refs when present", () => {
    const strategy = new AdmittedMailContextStrategy({
      included_folder_refs: ["inbox"],
      allowed_sender_domains: ["company.com"],
      unknown_sender_behavior: "ignore",
    });

    const facts = [
      {
        ...makeNormalizedMailFact("conv-inbox", "rec-inbox", "person@company.com", {
          queriedFolderRef: "inbox",
          parentFolderId: "opaque-inbox-id",
        }),
        created_at: new Date().toISOString(),
      },
      {
        ...makeNormalizedMailFact("conv-sent", "rec-sent", "person@company.com", {
          queriedFolderRef: "sentitems",
          parentFolderId: "opaque-sent-id",
        }),
        created_at: new Date().toISOString(),
      },
    ] as Fact[];

    const contexts = strategy.formContexts(facts, "scope-1");
    expect(contexts).toHaveLength(1);
    expect(contexts[0]!.context_id).toBe("conv-inbox");
  });

  it("excludes configured folder refs before sender admission", () => {
    const strategy = new AdmittedMailContextStrategy({
      excluded_folder_refs: ["sentitems"],
      allowed_sender_domains: ["company.com"],
      unknown_sender_behavior: "ignore",
    });

    const facts = [
      {
        ...makeNormalizedMailFact("conv-sent", "rec-sent", "person@company.com", {
          folderRefs: ["sentitems"],
        }),
        created_at: new Date().toISOString(),
      },
    ] as Fact[];

    expect(strategy.formContexts(facts, "scope-1")).toHaveLength(0);
  });

  it("ignores unknown senders when configured to ignore", () => {
    const strategy = new AdmittedMailContextStrategy({
      allowed_sender_domains: ["company.com"],
      unknown_sender_behavior: "ignore",
    });

    const facts = [
      { ...makeMailFact("conv-unknown", "created", "rec-unknown"), created_at: new Date().toISOString() },
    ] as Fact[];

    const contexts = strategy.formContexts(facts, "scope-1");
    expect(contexts).toHaveLength(0);
  });
});

describe("TimerContextStrategy", () => {
  const strategy = new TimerContextStrategy();

  it("groups timer facts by schedule_id", () => {
    const facts = [
      { ...makeTimerFact("job-a", "2024-01-01T00:00:00Z"), created_at: new Date().toISOString() },
      { ...makeTimerFact("job-a", "2024-01-01T01:00:00Z"), created_at: new Date().toISOString() },
      { ...makeTimerFact("job-b", "2024-01-01T00:00:00Z"), created_at: new Date().toISOString() },
    ] as Fact[];

    const contexts = strategy.formContexts(facts, "scope-1");
    expect(contexts).toHaveLength(2);

    const ctxA = contexts.find((c) => c.context_id === "timer:job-a")!;
    expect(ctxA.change_kinds).toEqual(["new_fact"]);
    expect(ctxA.facts).toHaveLength(2);

    const ctxB = contexts.find((c) => c.context_id === "timer:job-b")!;
    expect(ctxB.facts).toHaveLength(1);
  });

  it("uses getLatestRevisionOrdinal to compute ordinals", () => {
    const fact = { ...makeTimerFact("tick-ord"), created_at: new Date().toISOString() } as Fact;
    const contexts = strategy.formContexts([fact], "scope-1", {
      getLatestRevisionOrdinal: (id) => (id === "timer:tick-ord" ? 7 : null),
    });

    expect(contexts[0]!.previous_revision_ordinal).toBe(7);
    expect(contexts[0]!.current_revision_ordinal).toBe(8);
    expect(contexts[0]!.revision_id).toBe("timer:tick-ord:rev:8");
  });

  it("ignores non-timer facts", () => {
    const facts = [
      { ...makeMailFact("conv-x", "created"), created_at: new Date().toISOString() },
    ] as Fact[];

    const contexts = strategy.formContexts(facts, "scope-1");
    expect(contexts).toHaveLength(0);
  });
});

describe("CampaignRequestContextFormation", () => {
  function makeCampaignMailFact(
    conversationId: string,
    senderEmail: string,
    subject: string,
    bodyText: string,
    receivedAt = new Date().toISOString(),
  ): Omit<Fact, "created_at"> {
    const payload = {
      record_id: `rec-${conversationId}`,
      ordinal: receivedAt,
      event: {
        event_id: `rec-${conversationId}`,
        event_kind: "created",
        conversation_id: conversationId,
        thread_id: conversationId,
        from: { email: senderEmail, display_name: "Sender" },
        subject,
        body: { text: bodyText, preview: bodyText.slice(0, 100) },
        received_at: receivedAt,
      },
    };
    return {
      fact_id: `fact_campaign_${conversationId}_${senderEmail}`,
      fact_type: "mail.message.discovered",
      provenance: {
        source_id: "exchange:test",
        source_record_id: `rec-${conversationId}`,
        source_version: null,
        source_cursor: "cursor-1",
        observed_at: receivedAt,
      },
      payload_json: JSON.stringify(payload),
    };
  }

  it("opens context for allowed sender with campaign signals", () => {
    const strategy = new CampaignRequestContextFormation({
      campaign_request_senders: ["marketing@company.com"],
    });

    const facts = [
      {
        ...makeCampaignMailFact(
          "conv-campaign-1",
          "marketing@company.com",
          "Need a campaign for product launch",
          "Please create a campaign for product launch by next week.",
        ),
        created_at: new Date().toISOString(),
      },
    ] as Fact[];

    const contexts = strategy.formContexts(facts, "scope-1");
    expect(contexts).toHaveLength(1);
    expect(contexts[0]!.context_id).toBe("conv-campaign-1");
    expect(contexts[0]!.change_kinds).toContain("new_request");
  });

  it("silently skips non-allowed senders", () => {
    const strategy = new CampaignRequestContextFormation({
      campaign_request_senders: ["marketing@company.com"],
    });

    const facts = [
      {
        ...makeCampaignMailFact(
          "conv-spam",
          "random@spam.com",
          "Campaign request",
          "Please create a campaign for product launch.",
        ),
        created_at: new Date().toISOString(),
      },
    ] as Fact[];

    const contexts = strategy.formContexts(facts, "scope-1");
    expect(contexts).toHaveLength(0);
  });

  it("groups multiple facts by conversation_id", () => {
    const strategy = new CampaignRequestContextFormation({
      campaign_request_senders: ["marketing@company.com"],
    });

    const now = new Date().toISOString();
    const facts = [
      {
        ...makeCampaignMailFact(
          "conv-thread-1",
          "marketing@company.com",
          "Campaign for spring sale",
          "Need a campaign for spring sale.",
          now,
        ),
        created_at: now,
      },
      {
        ...makeCampaignMailFact(
          "conv-thread-1",
          "marketing@company.com",
          "Re: Campaign for spring sale",
          "Also target the trial segment.",
          now,
        ),
        created_at: now,
      },
    ] as Fact[];

    const contexts = strategy.formContexts(facts, "scope-1", {
      getLatestRevisionOrdinal: () => 1,
    });
    expect(contexts).toHaveLength(1);
    expect(contexts[0]!.facts).toHaveLength(2);
    expect(contexts[0]!.change_kinds).toContain("follow_up");
  });

  it("skips mail outside lookback window", () => {
    const strategy = new CampaignRequestContextFormation({
      campaign_request_senders: ["marketing@company.com"],
      campaign_request_lookback_days: 7,
    });

    const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const facts = [
      {
        ...makeCampaignMailFact(
          "conv-old",
          "marketing@company.com",
          "Old campaign request",
          "Please create a campaign.",
          oldDate,
        ),
        created_at: oldDate,
      },
    ] as Fact[];

    const contexts = strategy.formContexts(facts, "scope-1");
    expect(contexts).toHaveLength(0);
  });

  it("skips mail with low campaign confidence", () => {
    const strategy = new CampaignRequestContextFormation({
      campaign_request_senders: ["marketing@company.com"],
    });

    const facts = [
      {
        ...makeCampaignMailFact(
          "conv-low",
          "marketing@company.com",
          "Lunch tomorrow?",
          "Hey, want to grab lunch?",
        ),
        created_at: new Date().toISOString(),
      },
    ] as Fact[];

    const contexts = strategy.formContexts(facts, "scope-1");
    expect(contexts).toHaveLength(0);
  });

  it("also respects general mail admission domain allowlist", () => {
    const strategy = new CampaignRequestContextFormation({
      campaign_request_senders: ["marketing@company.com", "trusted@external.net"],
      admission: {
        mail: {
          allowed_sender_domains: ["company.com"],
          unknown_sender_behavior: "ignore",
        },
      },
    });

    const facts = [
      {
        ...makeCampaignMailFact(
          "conv-campaign-domain",
          "marketing@company.com",
          "Need a campaign for product launch",
          "Please create a campaign for product launch.",
        ),
        created_at: new Date().toISOString(),
      },
      {
        ...makeCampaignMailFact(
          "conv-campaign-blocked-domain",
          "trusted@external.net",
          "Need a campaign for launch",
          "Please create a campaign for product launch.",
        ),
        created_at: new Date().toISOString(),
      },
    ] as Fact[];

    const contexts = strategy.formContexts(facts, "scope-1");
    expect(contexts).toHaveLength(1);
    expect(contexts[0]!.context_id).toBe("conv-campaign-domain");
  });
});

describe("OperationIntakeContextFormation", () => {
  function makeSharedMailboxFact(
    conversationId: string,
    senderEmail: string,
    subject: string,
    bodyText: string,
    options?: {
      folderRefs?: string[];
      queriedFolderRef?: string;
      bodyPreview?: string;
      rawBodyText?: string;
    },
  ): Fact {
    const receivedAt = new Date().toISOString();
    const graphExtensions: Record<string, string> = {};
    if (options?.queriedFolderRef) {
      graphExtensions.queried_folder_ref = options.queriedFolderRef;
    }
    const payload = {
      record_id: `rec-${conversationId}`,
      ordinal: receivedAt,
      event: {
        event_id: `rec-${conversationId}`,
        event_kind: "created",
        conversation_id: conversationId,
        thread_id: conversationId,
        from: { email: senderEmail, display_name: "Sender" },
        subject,
        body: { text: options?.rawBodyText ?? bodyText, preview: options?.bodyPreview ?? bodyText.slice(0, 100) },
        received_at: receivedAt,
        payload: {
          conversation_id: conversationId,
          from: { email: senderEmail, display_name: "Sender" },
          sender: { email: senderEmail, display_name: "Sender" },
          subject,
          body: { text: options?.rawBodyText ?? bodyText, preview: options?.bodyPreview ?? bodyText.slice(0, 100) },
          ...(options?.bodyPreview ? { body_preview: options.bodyPreview } : {}),
          received_at: receivedAt,
          folder_refs: options?.folderRefs ?? [],
          ...(Object.keys(graphExtensions).length
            ? {
                source_extensions: {
                  namespaces: {
                    graph: graphExtensions,
                  },
                },
              }
            : {}),
        },
      },
    };
    return {
      fact_id: `fact_shared_${conversationId}_${senderEmail}`,
      fact_type: "mail.message.discovered",
      provenance: {
        source_id: "exchange:test",
        source_record_id: `rec-${conversationId}`,
        source_version: null,
        source_cursor: "cursor-1",
        observed_at: receivedAt,
      },
      payload_json: JSON.stringify(payload),
      created_at: receivedAt,
    };
  }

  it("routes a shared mailbox message into the configured subordinate operation scope", () => {
    const strategy = new OperationIntakeContextFormation({
      routes: [
        {
          route_id: "campaign-intake",
          target_scope_id: "email-marketing",
          match: {
            sender_domains: ["client.example"],
            subject_keywords: ["campaign", "test"],
            body_keywords: ["email campaign"],
          },
        },
      ],
    });

    const contexts = strategy.formContexts([
      makeSharedMailboxFact(
        "conv-shared-1",
        "willem@client.example",
        "test",
        "I want to test email campaign creation.",
      ),
    ], "shared-mailbox");

    expect(contexts).toHaveLength(1);
    expect(contexts[0]!.scope_id).toBe("email-marketing");
    expect(contexts[0]!.context_id).toBe("email-marketing:conv-shared-1");
    expect(contexts[0]!.change_kinds).toContain("operation_intake:campaign-intake");
  });

  it("keeps sentitems as source context but excludes it from operation-intake fresh work by default", () => {
    const strategy = new OperationIntakeContextFormation({
      routes: [
        {
          route_id: "campaign-intake",
          target_scope_id: "email-marketing",
          match: {
            sender_domains: ["global-maxima.com"],
            body_keywords: ["email campaign"],
          },
        },
      ],
    });

    const contexts = strategy.formContexts([
      makeSharedMailboxFact(
        "conv-self-outbound",
        "staccato.narada@global-maxima.com",
        "Re: test",
        "Please provide details for the email campaign.",
        { queriedFolderRef: "sentitems" },
      ),
    ], "shared-mailbox");

    expect(contexts).toHaveLength(0);
  });

  it("can explicitly admit outbound folders for operation-intake fresh work", () => {
    const strategy = new OperationIntakeContextFormation({
      fresh_work_boundary: {
        outbound_folder_behavior: "admit",
      },
      routes: [
        {
          route_id: "campaign-intake",
          target_scope_id: "email-marketing",
          match: {
            sender_domains: ["global-maxima.com"],
            body_keywords: ["email campaign"],
          },
        },
      ],
    });

    const contexts = strategy.formContexts([
      makeSharedMailboxFact(
        "conv-admitted-outbound",
        "staccato.narada@global-maxima.com",
        "Re: test",
        "Please provide details for the email campaign.",
        { queriedFolderRef: "sentitems" },
      ),
    ], "shared-mailbox");

    expect(contexts).toHaveLength(1);
    expect(contexts[0]!.context_id).toBe("email-marketing:conv-admitted-outbound");
  });

  it("matches operation-intake body keywords from body_preview before raw body text", () => {
    const strategy = new OperationIntakeContextFormation({
      routes: [
        {
          route_id: "campaign-intake",
          target_scope_id: "email-marketing",
          match: {
            sender_domains: ["client.example"],
            body_keywords: ["email campaign"],
          },
        },
      ],
    });

    const contexts = strategy.formContexts([
      makeSharedMailboxFact(
        "conv-preview",
        "willem@client.example",
        "test",
        "I want to test email campaign creation.",
        {
          bodyPreview: "I want to test email campaign creation.",
          rawBodyText: "<html><body><div>Graph raw body without matching plain semantic text</div></body></html>",
        },
      ),
    ], "shared-mailbox");

    expect(contexts).toHaveLength(1);
    expect(contexts[0]!.context_id).toBe("email-marketing:conv-preview");
  });

  it("does not route unmatched mailbox messages", () => {
    const strategy = new OperationIntakeContextFormation({
      routes: [
        {
          route_id: "campaign-intake",
          target_scope_id: "email-marketing",
          match: { subject_keywords: ["campaign"] },
        },
      ],
    });

    const contexts = strategy.formContexts([
      makeSharedMailboxFact("conv-support", "user@example.com", "Login help", "I cannot sign in."),
    ], "shared-mailbox");

    expect(contexts).toHaveLength(0);
  });

  it("stitches related operation-intake mail when Graph conversation ids split", () => {
    const strategy = new OperationIntakeContextFormation({
      routes: [
        {
          route_id: "campaign-intake",
          target_scope_id: "email-marketing",
          match: { sender_domains: ["client.example"], body_keywords: ["campaign"] },
        },
      ],
      mail_context_stitching: {
        enabled: true,
        lookback_days: 14,
        auto_attach_threshold: 0.85,
      },
    });

    const contexts = strategy.formContexts(
      [
        makeSharedMailboxFact(
          "conv-b",
          "willem@client.example",
          "Re: test",
          "For this campaign, use the standard template and send next week.",
        ),
      ],
      "shared-mailbox",
      {
        getLatestRevisionOrdinal: (contextId) => contextId === "email-marketing:conv-a" ? 1 : null,
        findMailContextStitchCandidates: () => [
          {
            context_id: "email-marketing:conv-a",
            conversation_id: "conv-a",
            sender_email: "willem@client.example",
            subject: "test",
            body_text: "I want to create an email campaign for C4X.",
            received_at: new Date().toISOString(),
          },
        ],
      },
    );

    expect(contexts).toHaveLength(1);
    expect(contexts[0]!.context_id).toBe("email-marketing:conv-a");
    expect(contexts[0]!.current_revision_ordinal).toBe(2);
    expect(contexts[0]!.change_kinds).toContain("mail_context_stitched");
    expect(contexts[0]!.mail_context_links?.[0]).toMatchObject({
      source_conversation_id: "conv-b",
      target_context_id: "email-marketing:conv-a",
    });
  });

  it("resolves operation_intake strategy from scope config", () => {
    const strategy = resolveContextStrategy("operation_intake", {
      operation_intake: {
        routes: [
          {
            route_id: "campaign-intake",
            target_scope_id: "email-marketing",
            match: { body_keywords: ["campaign"] },
          },
        ],
      },
    });

    expect(strategy).toBeInstanceOf(OperationIntakeContextFormation);
  });

  it("maps missing operation inputs to a governed draft_reply proposal", () => {
    const action = buildMissingInformationDraftReply({
      assumed_intent: "test the email campaign creation workflow",
      required_inputs: [
        "campaign goal",
        "audience or segment",
        "desired send timing",
        "approval owner",
      ],
    });

    expect(action.action_type).toBe("draft_reply");
    expect(action.authority).toBe("recommended");
    expect(JSON.parse(action.payload_json)).toEqual({
      body_text: "I assume you mean you want to test the email campaign creation workflow. To proceed, please provide campaign goal, audience or segment, desired send timing, approval owner.",
    });
    expect(action.rationale).toContain("no external operation effect");
  });
});
