export type SiteOperatorActionRequestLifecycleState =
  | "pending"
  | "executing"
  | "executed"
  | "rejected";

const transitions: Record<
  SiteOperatorActionRequestLifecycleState,
  readonly SiteOperatorActionRequestLifecycleState[]
> = {
  pending: ["executing", "rejected"],
  executing: ["executed", "rejected"],
  executed: [],
  rejected: [],
};

export function assertSiteOperatorActionRequestTransition(
  from: SiteOperatorActionRequestLifecycleState,
  to: SiteOperatorActionRequestLifecycleState,
): void {
  if (from !== to && !transitions[from].includes(to)) {
    throw new Error(`invalid_site_operator_action_request_transition: ${from} -> ${to}`);
  }
}
