import type { NarsEvent } from '../../src/types.js';
import { NARS_CLIENT_CONFORMANCE_FIXTURES } from '@narada2/nars-client-projection-contract';

const conformanceEvents = NARS_CLIENT_CONFORMANCE_FIXTURES.canonical_events as readonly NarsEvent[];

// Keep the compact stream-upsert fixture used by the focused tests, while
// exporting the complete representation-neutral set for cross-client checks.
export const sharedEvents: readonly NarsEvent[] = [
  conformanceEvents[0]!,
  conformanceEvents[1]!,
  conformanceEvents[2]!,
  conformanceEvents[3]!,
  conformanceEvents[5]!,
];

export const sharedConformanceEvents = conformanceEvents;
