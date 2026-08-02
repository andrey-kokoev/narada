import {
  validateHostFleetSnapshot,
  type HostFleetSnapshot,
} from '@narada-core/host-fleet/contract';
import {
  createHostFleetTransport,
  HostFleetTransportError,
  type HostFleetTransport,
} from './transport';

export interface HostFleetClient {
  list(): Promise<HostFleetSnapshot>;
}

export class HostFleetApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'HostFleetApiError';
    this.code = code;
  }
}

export function createHostFleetAdapter(
  transport: HostFleetTransport = createHostFleetTransport(),
): HostFleetClient {
  return {
    async list(): Promise<HostFleetSnapshot> {
      try {
        return validateHostFleetSnapshot(await transport.list());
      } catch (error) {
        if (error instanceof HostFleetApiError || error instanceof HostFleetTransportError) throw error;
        throw new HostFleetApiError(
          'invalid_response',
          error instanceof Error ? error.message : 'Host Fleet response did not match its contract.',
        );
      }
    },
  };
}
