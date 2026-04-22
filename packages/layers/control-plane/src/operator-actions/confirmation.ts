/**
 * Confirmation challenge logic for email-originated operator requests.
 *
 * Design:
 * - Raw challenge tokens (state, nonce) are never stored; only hashes are.
 * - Challenges are single-use and time-bounded.
 * - Confirmed challenges execute only through executeOperatorAction().
 */

import { createHash, randomBytes } from "node:crypto";
import type {
  ConfirmationChallenge,
  OperatorContact,
  ConfirmationProvidersConfig,
} from "../index.js";

export interface CreateChallengeOptions {
  scope_id: string;
  operator_action_request_id: string;
  principal_id: string;
  provider: "microsoft_entra";
  ttl_seconds?: number;
}

export interface CreateChallengeResult {
  challenge: ConfirmationChallenge;
  state_token: string;
  nonce: string;
}

export interface VerifyChallengeResult {
  ok: boolean;
  challenge?: ConfirmationChallenge;
  error?: string;
}

const DEFAULT_TTL_SECONDS = 600; // 10 minutes

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateChallengeTokens(): { state_token: string; nonce: string } {
  return {
    state_token: randomBytes(32).toString("hex"),
    nonce: randomBytes(32).toString("hex"),
  };
}

export function createConfirmationChallenge(
  options: CreateChallengeOptions,
): CreateChallengeResult {
  const { state_token, nonce } = generateChallengeTokens();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (options.ttl_seconds ?? DEFAULT_TTL_SECONDS) * 1000);

  const challenge: ConfirmationChallenge = {
    challenge_id: `ch_${now.getTime()}_${randomBytes(4).toString("hex")}`,
    scope_id: options.scope_id,
    operator_action_request_id: options.operator_action_request_id,
    principal_id: options.principal_id,
    provider: options.provider,
    state_hash: hashToken(state_token),
    nonce_hash: hashToken(nonce),
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    confirmed_at: null,
    consumed_at: null,
    status: "pending",
    failure_reason: null,
  };

  return { challenge, state_token, nonce };
}

export function buildConfirmationUrl(
  redirectBaseUrl: string,
  challengeId: string,
  stateToken: string,
): string {
  const base = redirectBaseUrl.replace(/\/$/, "");
  return `${base}/control/auth/microsoft/start?challenge_id=${encodeURIComponent(challengeId)}&state=${encodeURIComponent(stateToken)}`;
}

export function verifyChallengeState(
  challenge: ConfirmationChallenge | undefined,
  stateToken: string,
  nonce: string,
): VerifyChallengeResult {
  if (!challenge) {
    return { ok: false, error: "challenge_not_found" };
  }

  if (challenge.status !== "pending") {
    return { ok: false, challenge, error: `challenge_already_${challenge.status}` };
  }

  const now = new Date();
  const expiresAt = new Date(challenge.expires_at);
  if (now > expiresAt) {
    return { ok: false, challenge, error: "challenge_expired" };
  }

  if (challenge.state_hash !== hashToken(stateToken)) {
    return { ok: false, challenge, error: "invalid_state" };
  }

  if (challenge.nonce_hash !== hashToken(nonce)) {
    return { ok: false, challenge, error: "invalid_nonce" };
  }

  return { ok: true, challenge };
}

export function resolveContactByEmail(
  email: string,
  contacts: OperatorContact[],
): OperatorContact | undefined {
  const normalized = email.toLowerCase().trim();
  return contacts.find((c) => c.address.toLowerCase().trim() === normalized);
}

export function resolveContactByPrincipalId(
  principalId: string,
  contacts: OperatorContact[],
): OperatorContact | undefined {
  return contacts.find((c) => c.principal_id === principalId);
}

export function getMicrosoftAuthUrl(
  provider: NonNullable<ConfirmationProvidersConfig["microsoft_entra"]>,
  stateToken: string,
  nonce: string,
): string {
  const params = new URLSearchParams({
    client_id: provider.client_id,
    response_type: "code",
    redirect_uri: `${provider.redirect_base_url.replace(/\/$/, "")}/control/auth/microsoft/callback`,
    response_mode: "query",
    scope: "openid profile",
    state: stateToken,
    nonce,
  });
  return `https://login.microsoftonline.com/${provider.tenant_id}/oauth2/v2.0/authorize?${params.toString()}`;
}
