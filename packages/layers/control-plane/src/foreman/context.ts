/**
 * Policy Context Formation
 *
 * Domain-neutral context formation boundary between fact ingestion and
 * foreman policy admission. Mailbox-specific and timer-specific shaping
 * live in vertical strategies, not the kernel.
 */

import type { Fact } from "../facts/types.js";
import type { MailAdmissionConfig } from "../config/types.js";
import { MailboxContextStrategy } from "./mailbox/context-strategy.js";

export interface PolicyContext {
  /** Domain-neutral context identifier (legacy mail-era name removed) */
  context_id: string;
  /** Scope / mailbox / tenant identifier */
  scope_id: string;
  /** Revision identifier: format {context_id}:rev:{ordinal} */
  revision_id: string;
  /** Previous known revision ordinal from durable state */
  previous_revision_ordinal: number | null;
  /** Proposed current revision ordinal */
  current_revision_ordinal: number;
  /** Change classifications (e.g. "new_message", "moved") */
  change_kinds: string[];
  /** Facts that contributed to this context */
  facts: Fact[];
  /** Admission timestamp (ISO 8601) */
  synced_at: string;
}

export interface ContextFormationStrategy {
  formContexts(
    facts: Fact[],
    scopeId: string,
    options?: {
      getLatestRevisionOrdinal?: (contextId: string) => number | null;
    },
  ): PolicyContext[];
}

function extractMailSenderEmail(fact: Fact): string | null {
  try {
    const payload = JSON.parse(fact.payload_json) as Record<string, unknown>;
    const event = payload.event as Record<string, unknown> | undefined;
    if (!event || typeof event !== "object") return null;

    const normalizedPayload = event.payload as Record<string, unknown> | undefined;
    const from =
      (event.from as Record<string, unknown> | undefined) ??
      (normalizedPayload?.from as Record<string, unknown> | undefined);
    const sender =
      (event.sender as Record<string, unknown> | undefined) ??
      (normalizedPayload?.sender as Record<string, unknown> | undefined);
    const email =
      typeof from?.email === "string"
        ? from.email
        : typeof sender?.email === "string"
          ? sender.email
          : undefined;
    return email ? email.toLowerCase() : null;
  } catch {
    return null;
  }
}

function senderDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase();
}

function mailFactPassesAdmission(fact: Fact, admission?: MailAdmissionConfig): boolean {
  if (!admission || fact.fact_type !== "mail.message.discovered") {
    return true;
  }

  const addresses = new Set((admission.allowed_sender_addresses ?? []).map((s) => s.toLowerCase()));
  const domains = new Set((admission.allowed_sender_domains ?? []).map((s) => s.toLowerCase()));
  if (addresses.size === 0 && domains.size === 0) {
    return true;
  }

  const email = extractMailSenderEmail(fact);
  if (!email) {
    return admission.unknown_sender_behavior === "admit";
  }

  const domain = senderDomain(email);
  return addresses.has(email) || (domain !== null && domains.has(domain));
}

export class AdmittedMailContextStrategy implements ContextFormationStrategy {
  private readonly inner = new MailboxContextStrategy();

  constructor(private readonly admission?: MailAdmissionConfig) {}

  formContexts(
    facts: Fact[],
    scopeId: string,
    options?: {
      getLatestRevisionOrdinal?: (contextId: string) => number | null;
    },
  ): PolicyContext[] {
    return this.inner.formContexts(
      facts.filter((fact) => mailFactPassesAdmission(fact, this.admission)),
      scopeId,
      options,
    );
  }
}

function makeRevisionId(contextId: string, ordinal: number): string {
  return `${contextId}:rev:${ordinal}`;
}

export class TimerContextStrategy implements ContextFormationStrategy {
  formContexts(
    facts: Fact[],
    scopeId: string,
    options?: {
      getLatestRevisionOrdinal?: (contextId: string) => number | null;
    },
  ): PolicyContext[] {
    const groups = new Map<string, Fact[]>();

    for (const fact of facts) {
      if (fact.fact_type !== "timer.tick") {
        continue;
      }

      let scheduleId: string | undefined;

      try {
        const payload = JSON.parse(fact.payload_json) as Record<string, unknown>;
        const event = payload.event as Record<string, unknown> | undefined;
        if (event && typeof event === "object" && typeof event.schedule_id === "string") {
          scheduleId = event.schedule_id;
        }
      } catch {
        continue;
      }

      if (!scheduleId) {
        continue;
      }

      const contextId = `timer:${scheduleId}`;
      const group = groups.get(contextId) ?? [];
      group.push(fact);
      groups.set(contextId, group);
    }

    const now = new Date().toISOString();
    const contexts: PolicyContext[] = [];

    for (const [contextId, groupFacts] of groups) {
      const previousOrdinal = options?.getLatestRevisionOrdinal?.(contextId) ?? null;
      const currentOrdinal = (previousOrdinal ?? 0) + 1;

      contexts.push({
        context_id: contextId,
        scope_id: scopeId,
        revision_id: makeRevisionId(contextId, currentOrdinal),
        previous_revision_ordinal: previousOrdinal,
        current_revision_ordinal: currentOrdinal,
        change_kinds: ["new_fact"],
        facts: groupFacts,
        synced_at: now,
      });
    }

    return contexts;
  }
}

export class WebhookContextStrategy implements ContextFormationStrategy {
  formContexts(
    facts: Fact[],
    scopeId: string,
    options?: {
      getLatestRevisionOrdinal?: (contextId: string) => number | null;
    },
  ): PolicyContext[] {
    const groups = new Map<string, Fact[]>();

    for (const fact of facts) {
      if (fact.fact_type !== "webhook.received") {
        continue;
      }

      let endpointId: string | undefined;

      try {
        const payload = JSON.parse(fact.payload_json) as Record<string, unknown>;
        const event = payload.event as Record<string, unknown> | undefined;
        if (event && typeof event === "object" && typeof event.endpoint_id === "string") {
          endpointId = event.endpoint_id;
        }
      } catch {
        continue;
      }

      if (!endpointId) {
        continue;
      }

      const contextId = `webhook:${endpointId}`;
      const group = groups.get(contextId) ?? [];
      group.push(fact);
      groups.set(contextId, group);
    }

    const now = new Date().toISOString();
    const contexts: PolicyContext[] = [];

    for (const [contextId, groupFacts] of groups) {
      const previousOrdinal = options?.getLatestRevisionOrdinal?.(contextId) ?? null;
      const currentOrdinal = (previousOrdinal ?? 0) + 1;

      contexts.push({
        context_id: contextId,
        scope_id: scopeId,
        revision_id: makeRevisionId(contextId, currentOrdinal),
        previous_revision_ordinal: previousOrdinal,
        current_revision_ordinal: currentOrdinal,
        change_kinds: ["new_fact"],
        facts: groupFacts,
        synced_at: now,
      });
    }

    return contexts;
  }
}

/**
 * Campaign Request Context Formation Strategy
 *
 * Reads mail.message.discovered facts, filters by campaign_request_senders
 * allowlist, performs simple v0 keyword extraction, and groups by
 * conversation_id into campaign-request contexts.
 */
export interface CampaignRequestConfig {
  campaign_request_senders: string[];
  campaign_request_lookback_days?: number;
  admission?: {
    mail?: MailAdmissionConfig;
  };
}

export class CampaignRequestContextFormation implements ContextFormationStrategy {
  constructor(private readonly config: CampaignRequestConfig) {}

  formContexts(
    facts: Fact[],
    scopeId: string,
    options?: {
      getLatestRevisionOrdinal?: (contextId: string) => number | null;
    },
  ): PolicyContext[] {
    const allowlist = new Set(this.config.campaign_request_senders.map((s) => s.toLowerCase()));
    const lookbackDays = this.config.campaign_request_lookback_days ?? 7;
    const lookbackCutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

    const groups = new Map<string, { kinds: Set<string>; facts: Fact[] }>();

    for (const fact of facts) {
      if (fact.fact_type !== "mail.message.discovered") {
        continue;
      }

      if (!mailFactPassesAdmission(fact, this.config.admission?.mail)) {
        continue;
      }

      let contextId: string | undefined;
      let senderEmail: string | undefined;
      let receivedAt: string | undefined;
      let subject = "";
      let bodyText = "";

      try {
        const payload = JSON.parse(fact.payload_json) as Record<string, unknown>;
        const event = payload.event as Record<string, unknown> | undefined;

        if (event && typeof event === "object") {
          // Extract sender email
          const from = event.from as Record<string, unknown> | undefined;
          const sender = event.sender as Record<string, unknown> | undefined;
          const email =
            typeof from?.email === "string"
              ? from.email
              : typeof sender?.email === "string"
                ? sender.email
                : undefined;
          if (email) {
            senderEmail = email.toLowerCase();
          }

          // Extract conversation_id
          const convId = event.conversation_id;
          if (typeof convId === "string") {
            contextId = convId;
          }

          // Extract received_at
          const recv = event.received_at;
          if (typeof recv === "string") {
            receivedAt = recv;
          }

          // Extract subject
          if (typeof event.subject === "string") {
            subject = event.subject;
          }

          // Extract body text
          const body = event.body as Record<string, unknown> | undefined;
          if (typeof body?.text === "string") {
            bodyText = body.text;
          } else if (typeof body?.preview === "string") {
            bodyText = body.preview;
          }
        }
      } catch {
        // Unparseable payload — skip
        continue;
      }

      // Skip if missing required fields
      if (!contextId || !senderEmail) {
        continue;
      }

      // Skip non-allowed senders
      if (!allowlist.has(senderEmail)) {
        continue;
      }

      // Skip mail outside lookback window
      if (receivedAt) {
        const recvDate = new Date(receivedAt);
        if (!isNaN(recvDate.getTime()) && recvDate < lookbackCutoff) {
          continue;
        }
      }

      // Simple v0 keyword extraction for campaign classification
      const extraction = extractCampaignFields(subject, bodyText);

      // Skip if confidence is below threshold (v0: 0.5)
      if (extraction.confidence < 0.5) {
        continue;
      }

      let kind = "new_request";
      const priorOrdinal = options?.getLatestRevisionOrdinal?.(contextId);
      if (priorOrdinal !== null && priorOrdinal !== undefined) {
        kind = "follow_up";
      }

      const group = groups.get(contextId) ?? { kinds: new Set<string>(), facts: [] };
      group.kinds.add(kind);
      group.facts.push(fact);
      groups.set(contextId, group);
    }

    const now = new Date().toISOString();
    const contexts: PolicyContext[] = [];

    for (const [contextId, group] of groups) {
      const previousOrdinal = options?.getLatestRevisionOrdinal?.(contextId) ?? null;
      const currentOrdinal = (previousOrdinal ?? 0) + 1;

      contexts.push({
        context_id: contextId,
        scope_id: scopeId,
        revision_id: makeRevisionId(contextId, currentOrdinal),
        previous_revision_ordinal: previousOrdinal,
        current_revision_ordinal: currentOrdinal,
        change_kinds: Array.from(group.kinds),
        facts: group.facts,
        synced_at: now,
      });
    }

    return contexts;
  }
}

/** Simple v0 keyword-based campaign field extraction */
function extractCampaignFields(subject: string, bodyText: string) {
  const subjLower = subject.toLowerCase();
  const bodyLower = bodyText.toLowerCase();

  // Campaign name extraction
  let requestedCampaignName: string | null = null;
  const namePatterns = [
    /campaign for "?([^"]+)"?/i,
    /campaign for '?([^']+)'?/i,
    /campaign for (\S+(?:\s+\S+){0,5})/i,
    /"([^"]+)"\s+campaign/i,
    /'([^']+)'\s+campaign/i,
    /(\S+(?:\s+\S+){0,3})\s+campaign/i,
    /email for "?([^"]+)"?/i,
    /email for (\S+(?:\s+\S+){0,5})/i,
  ];
  for (const pattern of namePatterns) {
    const match = subject.match(pattern) || bodyText.match(pattern);
    if (match && match[1]) {
      requestedCampaignName = match[1].trim();
      break;
    }
  }

  // Timing extraction
  let requestedTiming: string | null = null;
  const timingPatterns = [
    /\bby\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|tomorrow|next\s+\w+)\b/i,
    /\bnext\s+(week|month|Monday|Tuesday|Wednesday|Thursday|Friday)\b/i,
    /\bthis\s+(week|month)\b/i,
    /\b(ASAP|urgent|rush)\b/i,
    /\bin\s+\d+\s+days?\b/i,
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?\b/i,
  ];
  for (const pattern of timingPatterns) {
    const match = bodyText.match(pattern) || subject.match(pattern);
    if (match && match[0]) {
      requestedTiming = match[0].trim();
      break;
    }
  }

  // Confidence scoring
  let confidence = 0.3; // base score
  if (requestedCampaignName) confidence += 0.2;
  if (requestedTiming) confidence += 0.2;
  if (subjLower.includes("campaign") || subjLower.includes("email")) confidence += 0.1;
  if (bodyLower.includes("campaign") || bodyLower.includes("newsletter")) confidence += 0.1;
  if (bodyText.length < 20) confidence -= 0.1;
  confidence = Math.max(0, Math.min(1, confidence));

  return {
    requested_campaign_name: requestedCampaignName,
    requested_timing: requestedTiming,
    confidence,
  };
}

/**
 * Resolve a context strategy name to its implementation.
 *
 * For campaign strategy, pass `CampaignRequestConfig` via the optional
 * `config` parameter.
 */
export function resolveContextStrategy(
  strategy: string,
  config?: unknown,
): ContextFormationStrategy {
  switch (strategy) {
    case "mail":
      return new AdmittedMailContextStrategy((config as { admission?: { mail?: MailAdmissionConfig } } | undefined)?.admission?.mail);
    case "campaign": {
      const campaignConfig = config as CampaignRequestConfig | undefined;
      if (!campaignConfig || !Array.isArray(campaignConfig.campaign_request_senders)) {
        throw new Error(
          `Campaign context strategy requires campaign_request_senders array in config`,
        );
      }
      return new CampaignRequestContextFormation(campaignConfig);
    }
    case "timer":
      return new TimerContextStrategy();
    case "webhook":
      return new WebhookContextStrategy();
    case "filesystem":
      return new FilesystemContextStrategy();
    default:
      throw new Error(`Unknown context strategy: ${strategy}`);
  }
}

export class FilesystemContextStrategy implements ContextFormationStrategy {
  formContexts(
    facts: Fact[],
    scopeId: string,
    options?: {
      getLatestRevisionOrdinal?: (contextId: string) => number | null;
    },
  ): PolicyContext[] {
    const groups = new Map<string, Fact[]>();

    for (const fact of facts) {
      if (fact.fact_type !== "filesystem.change") {
        continue;
      }

      let watchId: string | undefined;

      try {
        const payload = JSON.parse(fact.payload_json) as Record<string, unknown>;
        const event = payload.event as Record<string, unknown> | undefined;
        if (event && typeof event === "object" && typeof event.watch_id === "string") {
          watchId = event.watch_id;
        }
      } catch {
        continue;
      }

      if (!watchId) {
        continue;
      }

      const contextId = `fs:${watchId}`;
      const group = groups.get(contextId) ?? [];
      group.push(fact);
      groups.set(contextId, group);
    }

    const now = new Date().toISOString();
    const contexts: PolicyContext[] = [];

    for (const [contextId, groupFacts] of groups) {
      const previousOrdinal = options?.getLatestRevisionOrdinal?.(contextId) ?? null;
      const currentOrdinal = (previousOrdinal ?? 0) + 1;

      contexts.push({
        context_id: contextId,
        scope_id: scopeId,
        revision_id: makeRevisionId(contextId, currentOrdinal),
        previous_revision_ordinal: previousOrdinal,
        current_revision_ordinal: currentOrdinal,
        change_kinds: ["new_fact"],
        facts: groupFacts,
        synced_at: now,
      });
    }

    return contexts;
  }
}
