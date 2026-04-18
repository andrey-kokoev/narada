import type { GraphRecipient } from "../types/graph.js";
import type { NormalizedAddress } from "../types/normalized.js";

function normalizeString(value?: string): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeEmail(value?: string): string | undefined {
  const trimmed = normalizeString(value);
  return trimmed ? trimmed.toLowerCase() : undefined;
}

export function normalizeRecipient(
  recipient?: GraphRecipient,
): NormalizedAddress | undefined {
  const emailAddress = recipient?.emailAddress;

  const display_name = normalizeString(emailAddress?.name);
  const email = normalizeEmail(emailAddress?.address);

  if (!display_name && !email) {
    return undefined;
  }

  return {
    ...(display_name ? { display_name } : {}),
    ...(email ? { email } : {}),
  };
}

export function normalizeRecipientList(
  recipients?: GraphRecipient[],
): NormalizedAddress[] {
  if (!recipients?.length) {
    return [];
  }

  return recipients
    .map(normalizeRecipient)
    .filter((value): value is NormalizedAddress => value !== undefined);
}
