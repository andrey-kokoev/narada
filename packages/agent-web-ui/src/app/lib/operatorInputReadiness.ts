export function isTransportLive(phase: string | null | undefined): boolean {
  return phase === 'live';
}

export function isOperatorInputTransportReady(
  streamLive: boolean,
  inputEndpoint: string | null | undefined,
): boolean {
  return Boolean(inputEndpoint) || streamLive;
}

export function operatorInputNotReadyReason(status: string | null | undefined): string {
  const detail = String(status ?? '').trim();
  return detail
    ? `Waiting for the event stream to connect (${detail}) before sending.`
    : 'Waiting for the event stream to connect before sending.';
}
