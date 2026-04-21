/**
 * Live Observation Adapter
 *
 * Read-only reconciliation seam that fetches observations from external
 * sources (Graph API, webhook, etc.) without executing effects or
 * mutating durable state.
 *
 * Task 354 — Bounded spike. Only `send_reply` via header-based lookup
 * is fully proven. Non-send actions require payload_json storage that
 * exists in schema but is not yet populated by the handoff step.
 */

export interface PendingOutbound {
  outboundId: string;
  contextId: string;
  scopeId: string;
  actionType: string;
  payloadJson?: string | null;
  internetMessageId?: string | null;
}

export interface LiveObservation {
  observationId: string;
  outboundId: string;
  scopeId: string;
  observedStatus: "confirmed" | "failed";
  observedAt: string;
  evidence?: string;
}

export interface LiveObservationAdapter {
  fetchObservations(pending: PendingOutbound[]): Promise<LiveObservation[]>;
}

// ---------------------------------------------------------------------------
// Graph API observation client (mockable boundary)
// ---------------------------------------------------------------------------

export interface GraphMessage {
  id: string;
  isRead?: boolean;
  folderRefs?: string[];
  categoryRefs?: string[];
}

export interface GraphObservationClient {
  findMessageByInternetMessageId(
    scopeId: string,
    internetMessageId: string,
  ): Promise<GraphMessage | null>;
  findMessageByOutboundHeader(
    scopeId: string,
    outboundId: string,
  ): Promise<GraphMessage | null>;
  findMessageById(scopeId: string, messageId: string): Promise<GraphMessage | null>;
}

// ---------------------------------------------------------------------------
// Graph Live Observation Adapter
// ---------------------------------------------------------------------------

export class GraphLiveObservationAdapter implements LiveObservationAdapter {
  constructor(private readonly client: GraphObservationClient) {}

  async fetchObservations(pending: PendingOutbound[]): Promise<LiveObservation[]> {
    const observations: LiveObservation[] = [];
    const now = new Date().toISOString();

    for (const cmd of pending) {
      try {
        const obs = await this.observeOne(cmd, now);
        if (obs) observations.push(obs);
      } catch {
        // Adapter failure for one outbound must not block others
        // and must never fabricate confirmation.
        continue;
      }
    }

    return observations;
  }

  private async observeOne(cmd: PendingOutbound, now: string): Promise<LiveObservation | null> {
    if (cmd.actionType === "send_reply" || cmd.actionType === "propose_action") {
      return this.observeSendReply(cmd, now);
    }

    return this.observeNonSend(cmd, now);
  }

  private async observeSendReply(
    cmd: PendingOutbound,
    now: string,
  ): Promise<LiveObservation | null> {
    // Primary: internet_message_id is the strongest identity signal.
    if (cmd.internetMessageId) {
      const msg = await this.client.findMessageByInternetMessageId(
        cmd.scopeId,
        cmd.internetMessageId,
      );
      if (msg) {
        return {
          observationId: `obs_graph_imid_${cmd.outboundId}`,
          outboundId: cmd.outboundId,
          scopeId: cmd.scopeId,
          observedStatus: "confirmed",
          observedAt: now,
          evidence: `Found message ${msg.id} matching internetMessageId`,
        };
      }
    }

    // Fallback: outbound_id header injected by send worker.
    const msg = await this.client.findMessageByOutboundHeader(cmd.scopeId, cmd.outboundId);
    if (msg) {
      return {
        observationId: `obs_graph_hdr_${cmd.outboundId}`,
        outboundId: cmd.outboundId,
        scopeId: cmd.scopeId,
        observedStatus: "confirmed",
        observedAt: now,
        evidence: `Found message ${msg.id} with outbound_id header`,
      };
    }

    return null;
  }

  private async observeNonSend(
    cmd: PendingOutbound,
    now: string,
  ): Promise<LiveObservation | null> {
    if (!cmd.payloadJson) return null;

    let payload: {
      target_message_id?: string;
      destination_folder_id?: string;
      categories?: string[];
    };
    try {
      payload = JSON.parse(cmd.payloadJson) as {
        target_message_id?: string;
        destination_folder_id?: string;
        categories?: string[];
      };
    } catch {
      return null;
    }

    if (!payload.target_message_id) return null;

    const msg = await this.client.findMessageById(cmd.scopeId, payload.target_message_id);
    if (!msg) return null;

    if (cmd.actionType === "mark_read") {
      const confirmed = msg.isRead === true;
      return {
        observationId: `obs_graph_read_${cmd.outboundId}`,
        outboundId: cmd.outboundId,
        scopeId: cmd.scopeId,
        observedStatus: confirmed ? "confirmed" : "failed",
        observedAt: now,
        evidence: confirmed ? "Message is_read=true" : "Message is_read=false",
      };
    }

    if (cmd.actionType === "move_message") {
      const dest = payload.destination_folder_id;
      if (!dest) return null;
      const confirmed = msg.folderRefs?.includes(dest) ?? false;
      return {
        observationId: `obs_graph_move_${cmd.outboundId}`,
        outboundId: cmd.outboundId,
        scopeId: cmd.scopeId,
        observedStatus: confirmed ? "confirmed" : "failed",
        observedAt: now,
        evidence: confirmed
          ? `Message found in folder ${dest}`
          : `Message not in folder ${dest}`,
      };
    }

    if (cmd.actionType === "set_categories") {
      const expected = new Set(payload.categories ?? []);
      const actual = new Set(msg.categoryRefs ?? []);
      const confirmed = expected.size > 0 && [...expected].every((c) => actual.has(c));
      return {
        observationId: `obs_graph_cat_${cmd.outboundId}`,
        outboundId: cmd.outboundId,
        scopeId: cmd.scopeId,
        observedStatus: confirmed ? "confirmed" : "failed",
        observedAt: now,
        evidence: confirmed
          ? `Categories ${[...expected].join(", ")} present`
          : `Expected categories not found`,
      };
    }

    return null;
  }
}
