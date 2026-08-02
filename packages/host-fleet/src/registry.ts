import { createHash, timingSafeEqual } from 'node:crypto';
import {
  HOST_FLEET_HOST_SCHEMA,
  HOST_FLEET_SNAPSHOT_SCHEMA,
  validateHostFleetAuthenticatedObservation,
  validateHostFleetMembershipAuthority,
  validateHostFleetSnapshot,
  validateHostFleetTimestamp,
  type HostFleetAuthenticatedObservation,
  type HostFleetHost,
  type HostFleetMembershipAuthority,
  type HostFleetSnapshot,
} from './contract.js';

export interface HostFleetReadModel {
  list(): Promise<HostFleetSnapshot>;
}

export class HostFleetMembershipRefusal extends Error {
  readonly code = 'host_fleet_membership_proof_invalid';

  constructor() {
    super('Host Fleet observation did not satisfy host membership authority.');
    this.name = 'HostFleetMembershipRefusal';
  }
}

function secretDigest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

function secretMatches(expected: string, presented: string): boolean {
  return timingSafeEqual(secretDigest(expected), secretDigest(presented));
}

function cloneHost(host: HostFleetHost): HostFleetHost {
  return {
    schema: HOST_FLEET_HOST_SCHEMA,
    identity: { ...host.identity },
    reachability: { ...host.reachability },
    health: { ...host.health },
    operator_console: { ...host.operator_console },
  };
}

function cloneSnapshot(snapshot: HostFleetSnapshot): HostFleetSnapshot {
  return {
    schema: HOST_FLEET_SNAPSHOT_SCHEMA,
    generated_at: snapshot.generated_at,
    hosts: snapshot.hosts.map(cloneHost),
  };
}

export function createHostFleetReadRegistry(input: {
  authority: HostFleetMembershipAuthority;
  observations: readonly HostFleetAuthenticatedObservation[];
  generated_at?: string;
}): HostFleetReadModel {
  const authority = validateHostFleetMembershipAuthority(input.authority);
  const hosts = input.observations.map((candidate) => {
    const observation = validateHostFleetAuthenticatedObservation(candidate);
    if (!secretMatches(authority.host_fleet_membership_secret, observation.host_fleet_membership_secret)) {
      throw new HostFleetMembershipRefusal();
    }
    return { schema: HOST_FLEET_HOST_SCHEMA, ...observation.host } satisfies HostFleetHost;
  });
  hosts.sort((left, right) => left.identity.host_id.localeCompare(right.identity.host_id));
  const ids = new Set<string>();
  for (const host of hosts) {
    if (ids.has(host.identity.host_id)) throw new Error('host_fleet_host_duplicate');
    ids.add(host.identity.host_id);
  }
  const generatedAt = validateHostFleetTimestamp(
    input.generated_at ?? new Date().toISOString(),
    'host_fleet_snapshot_generated_at_invalid',
  );
  const snapshot = validateHostFleetSnapshot({
    schema: HOST_FLEET_SNAPSHOT_SCHEMA,
    generated_at: generatedAt,
    hosts: hosts.map(cloneHost),
  });
  return Object.freeze({
    async list(): Promise<HostFleetSnapshot> {
      return cloneSnapshot(snapshot);
    },
  });
}

export function createEmptyHostFleetReadModel(
  now: () => Date = () => new Date(),
): HostFleetReadModel {
  return Object.freeze({
    async list(): Promise<HostFleetSnapshot> {
      return {
        schema: HOST_FLEET_SNAPSHOT_SCHEMA,
        generated_at: now().toISOString(),
        hosts: [],
      };
    },
  });
}
