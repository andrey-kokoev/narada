import { describe, expect, it, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import {
  admitEmailOperatorRequest,
  createConfirmationChallenge,
  verifyChallengeState,
  verifyMicrosoftAuth,
  SqliteCoordinatorStore,
  type OperatorContact,
  type TokenExchangeClient,
  type TokenDecoder,
} from "../../../src/index.js";

function contact(overrides: Partial<OperatorContact> = {}): OperatorContact {
  return {
    principal_id: "andrey",
    channel: "email",
    address: "andrey@kokoev.name",
    identity_provider: "microsoft_entra",
    tenant_id: "tenant-1",
    entra_user_id: "user-1",
    may_open_operator_requests: true,
    may_confirm_actions: ["approve_draft_for_send", "reject_draft"],
    ...overrides,
  };
}

function tokenDecoder(claims: Record<string, unknown>): TokenDecoder {
  return {
    decodeIdToken: () => ({
      tid: String(claims.tid ?? "tenant-1"),
      aud: String(claims.aud ?? "client-1"),
      oid: String(claims.oid ?? "user-1"),
      sub: String(claims.sub ?? "sub-1"),
      nonce: String(claims.nonce ?? "nonce-1"),
      exp: Number(claims.exp ?? Math.floor(Date.now() / 1000) + 60),
      iat: Number(claims.iat ?? Math.floor(Date.now() / 1000) - 1),
    }),
  };
}

const tokenExchange: TokenExchangeClient = {
  exchangeCode: async () => ({ access_token: "access-token", id_token: "id-token" }),
};

describe("email-originated operator confirmation", () => {
  let db: Database.Database;
  let coordinatorStore: SqliteCoordinatorStore;

  beforeEach(() => {
    db = new Database(":memory:");
    coordinatorStore = new SqliteCoordinatorStore({ db });
    coordinatorStore.initSchema();
  });

  afterEach(() => {
    db.close();
  });

  it("rejects unrecognized email senders without creating a pending action", () => {
    const result = admitEmailOperatorRequest(
      {
        scope_id: "scope-1",
        source_message_id: "msg-1",
        from_address: "intruder@example.com",
        action_type: "approve_draft_for_send",
        target_id: "out-1",
      },
      [contact()],
      {
        microsoft_entra: {
          tenant_id: "tenant-1",
          client_id: "client-1",
          client_secret: "secret",
          redirect_base_url: "http://127.0.0.1:8791",
        },
      },
      coordinatorStore,
    );

    expect(result).toEqual({ admitted: false, reason: "unrecognized_sender" });
    expect(coordinatorStore.getPendingOperatorActionRequests("scope-1")).toHaveLength(0);
  });

  it("admits recognized contacts as pending audited requests with confirmation challenge", () => {
    const result = admitEmailOperatorRequest(
      {
        scope_id: "scope-1",
        source_message_id: "msg-1",
        from_address: "ANDREY@KOKOEV.NAME",
        action_type: "approve_draft_for_send",
        target_id: "out-1",
        payload_json: JSON.stringify({ reason: "operator email request" }),
      },
      [contact()],
      {
        microsoft_entra: {
          tenant_id: "tenant-1",
          client_id: "client-1",
          client_secret: "secret",
          redirect_base_url: "http://127.0.0.1:8791",
        },
      },
      coordinatorStore,
    );

    expect(result.admitted).toBe(true);
    expect(result.confirmation_url).toContain("/control/auth/microsoft/start");

    const pending = coordinatorStore.getPendingOperatorActionRequests("scope-1");
    expect(pending).toHaveLength(1);
    expect(pending[0]!.requested_by).toBe("andrey");
    expect(pending[0]!.source_message_id).toBe("msg-1");
    expect(pending[0]!.status).toBe("pending");
    expect(pending[0]!.executed_at).toBeNull();

    const challengeRows = db.prepare("select * from confirmation_challenges").all() as Array<Record<string, unknown>>;
    expect(challengeRows).toHaveLength(1);
    expect(challengeRows[0]!.operator_action_request_id).toBe(pending[0]!.request_id);
    expect(challengeRows[0]!.state_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(challengeRows[0]!.nonce_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not admit actions outside the contact allowlist", () => {
    const result = admitEmailOperatorRequest(
      {
        scope_id: "scope-1",
        source_message_id: "msg-1",
        from_address: "andrey@kokoev.name",
        action_type: "trigger_sync",
      },
      [contact({ may_confirm_actions: ["reject_draft"] })],
      {
        microsoft_entra: {
          tenant_id: "tenant-1",
          client_id: "client-1",
          client_secret: "secret",
          redirect_base_url: "http://127.0.0.1:8791",
        },
      },
      coordinatorStore,
    );

    expect(result).toEqual({ admitted: false, reason: "action_not_permitted_for_contact" });
    expect(coordinatorStore.getPendingOperatorActionRequests("scope-1")).toHaveLength(0);
  });

  it("enforces challenge state, expiry, and single-use status before confirmation", () => {
    const { challenge, state_token, nonce } = createConfirmationChallenge({
      scope_id: "scope-1",
      operator_action_request_id: "req-1",
      principal_id: "andrey",
      provider: "microsoft_entra",
      ttl_seconds: 60,
    });

    expect(verifyChallengeState(challenge, state_token, nonce)).toMatchObject({ ok: true });
    expect(verifyChallengeState(challenge, "wrong-state", nonce)).toMatchObject({ ok: false, error: "invalid_state" });
    expect(verifyChallengeState({ ...challenge, status: "consumed" }, state_token, nonce)).toMatchObject({
      ok: false,
      error: "challenge_already_consumed",
    });
    expect(verifyChallengeState({ ...challenge, expires_at: "2000-01-01T00:00:00.000Z" }, state_token, nonce)).toMatchObject({
      ok: false,
      error: "challenge_expired",
    });
  });

  it("verifies Microsoft tenant, audience, user, nonce, and expiry claims", async () => {
    const provider = {
      tenant_id: "tenant-1",
      client_id: "client-1",
      client_secret: "secret",
      redirect_base_url: "http://127.0.0.1:8791",
    };

    const ok = await verifyMicrosoftAuth({
      code: "code-1",
      provider,
      expectedTenantId: "tenant-1",
      expectedClientId: "client-1",
      expectedEntraUserId: "user-1",
      expectedNonce: "nonce-1",
      tokenExchange,
      tokenDecoder: tokenDecoder({}),
    });
    expect(ok.ok).toBe(true);

    await expect(verifyMicrosoftAuth({
      code: "code-1",
      provider,
      expectedTenantId: "tenant-1",
      expectedClientId: "client-1",
      expectedEntraUserId: "user-2",
      expectedNonce: "nonce-1",
      tokenExchange,
      tokenDecoder: tokenDecoder({}),
    })).resolves.toMatchObject({ ok: false, error: "user_mismatch: expected user-2, got user-1" });

    await expect(verifyMicrosoftAuth({
      code: "code-1",
      provider,
      expectedTenantId: "tenant-1",
      expectedClientId: "client-1",
      expectedEntraUserId: "user-1",
      expectedNonce: "nonce-2",
      tokenExchange,
      tokenDecoder: tokenDecoder({}),
    })).resolves.toMatchObject({ ok: false, error: "nonce_mismatch" });

    await expect(verifyMicrosoftAuth({
      code: "code-1",
      provider,
      expectedTenantId: "tenant-1",
      expectedClientId: "client-1",
      expectedEntraUserId: "user-1",
      tokenExchange,
      tokenDecoder: tokenDecoder({ exp: Math.floor(Date.now() / 1000) - 10 }),
    })).resolves.toMatchObject({ ok: false, error: "token_expired" });
  });
});
