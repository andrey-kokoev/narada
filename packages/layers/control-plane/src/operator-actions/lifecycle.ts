export type OperatorActionRequestLifecycleState =
  | "pending"
  | "executing"
  | "executed"
  | "rejected";

export type ConfirmationChallengeLifecycleState =
  | "pending"
  | "confirmed"
  | "expired"
  | "rejected"
  | "consumed";

const operatorActionTransitions: Record<
  OperatorActionRequestLifecycleState,
  readonly OperatorActionRequestLifecycleState[]
> = {
  pending: ["executing", "rejected"],
  executing: ["executed", "rejected"],
  executed: [],
  rejected: [],
};

const confirmationTransitions: Record<
  ConfirmationChallengeLifecycleState,
  readonly ConfirmationChallengeLifecycleState[]
> = {
  pending: ["confirmed", "expired", "rejected"],
  confirmed: ["consumed"],
  expired: [],
  rejected: [],
  consumed: [],
};

export function canTransitionOperatorActionRequest(
  from: OperatorActionRequestLifecycleState,
  to: OperatorActionRequestLifecycleState,
): boolean {
  return from === to || operatorActionTransitions[from].includes(to);
}

export function assertOperatorActionRequestTransition(
  from: OperatorActionRequestLifecycleState,
  to: OperatorActionRequestLifecycleState,
): void {
  if (!canTransitionOperatorActionRequest(from, to)) {
    throw new Error(`invalid_operator_action_request_transition: ${from} -> ${to}`);
  }
}

export function canTransitionConfirmationChallenge(
  from: ConfirmationChallengeLifecycleState,
  to: ConfirmationChallengeLifecycleState,
): boolean {
  return from === to || confirmationTransitions[from].includes(to);
}

export function assertConfirmationChallengeTransition(
  from: ConfirmationChallengeLifecycleState,
  to: ConfirmationChallengeLifecycleState,
): void {
  if (!canTransitionConfirmationChallenge(from, to)) {
    throw new Error(`invalid_confirmation_challenge_transition: ${from} -> ${to}`);
  }
}
