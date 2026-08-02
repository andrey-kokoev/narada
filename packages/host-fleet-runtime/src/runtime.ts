import type { HostFleetRuntimeConfig } from './config.js';
import { HostFleetAuthority, type HostFleetAuthorityServer } from './authority.js';
import { createHostFleetPublisher, type HostFleetPublisher } from './publisher.js';

export interface RunningHostFleetRuntime {
  mode: 'authority' | 'publisher';
  url: string | null;
  stop(): Promise<void>;
}

export async function startHostFleetRuntime(input: {
  config: HostFleetRuntimeConfig;
  state_path: string;
  fetch_fn?: typeof fetch;
  now?: () => Date;
}): Promise<RunningHostFleetRuntime> {
  if (input.config.mode === 'authority') {
    const authority = new HostFleetAuthority(input);
    const server: HostFleetAuthorityServer = await authority.start();
    return { mode: 'authority', url: server.url, stop: server.stop };
  }
  const publisher: HostFleetPublisher = createHostFleetPublisher(input);
  const url = await publisher.start();
  return { mode: 'publisher', url, stop: () => publisher.stop() };
}
