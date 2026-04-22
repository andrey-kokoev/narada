/**
 * Email-originated operator request admission.
 *
 * Design:
 * - Email address alone is not authority.
 * - A recognized operator contact may create a pending audited request.
 * - The request does NOT execute until Microsoft-auth confirmation succeeds.
 * - All mutation flows through executeOperatorAction() after confirmation.
 */

import type {
  OperatorContact,
  OperatorActionRequest,
  CoordinatorStore,
  ConfirmationProvidersConfig,
} from "../index.js";
import {
  resolveContactByEmail,
  createConfirmationChallenge,
  buildConfirmationUrl,
} from "./confirmation.js";

export interface EmailOperatorRequestInput {
  scope_id: string;
  source_message_id: string;
  from_address: string;
  action_type: string;
  target_id?: string;
  payload_json?: string;
  rationale?: string;
}

export interface AdmitEmailOperatorRequestResult {
  admitted: boolean;
  request?: OperatorActionRequest;
  confirmation_url?: string;
  reason?: string;
}

export function admitEmailOperatorRequest(
  input: EmailOperatorRequestInput,
  contacts: OperatorContact[],
  providers: ConfirmationProvidersConfig | undefined,
  coordinatorStore: CoordinatorStore,
): AdmitEmailOperatorRequestResult {
  const contact = resolveContactByEmail(input.from_address, contacts);
  if (!contact) {
    return { admitted: false, reason: "unrecognized_sender" };
  }

  if (!contact.may_open_operator_requests) {
    return { admitted: false, reason: "contact_may_not_open_requests" };
  }

  // Validate the requested action is in the contact's may_confirm_actions list
  if (!contact.may_confirm_actions.includes(input.action_type as import("../config/types.js").ConfirmableOperatorAction)) {
    return { admitted: false, reason: "action_not_permitted_for_contact" };
  }

  const requestId = `oar_email_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  const request: OperatorActionRequest = {
    request_id: requestId,
    scope_id: input.scope_id,
    action_type: input.action_type as OperatorActionRequest["action_type"],
    target_id: input.target_id ?? null,
    payload_json: input.payload_json ?? null,
    source_message_id: input.source_message_id,
    status: "pending",
    requested_by: contact.principal_id,
    requested_at: now,
    executed_at: null,
  };

  coordinatorStore.insertOperatorActionRequest(request);

  // Create confirmation challenge
  const provider = contact.identity_provider;
  const providerConfig = provider === "microsoft_entra" ? providers?.microsoft_entra : undefined;

  if (!providerConfig) {
    return { admitted: false, reason: `provider_not_configured: ${provider}` };
  }

  const { challenge, state_token } = createConfirmationChallenge({
    scope_id: input.scope_id,
    operator_action_request_id: requestId,
    principal_id: contact.principal_id,
    provider,
  });

  coordinatorStore.insertConfirmationChallenge(challenge);

  const confirmationUrl = buildConfirmationUrl(
    providerConfig.redirect_base_url,
    challenge.challenge_id,
    state_token,
  );

  return {
    admitted: true,
    request,
    confirmation_url: confirmationUrl,
  };
}
