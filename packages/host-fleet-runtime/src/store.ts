import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from '@narada-core/sqlite';
import { validateHostFleetHeartbeat, type HostFleetHeartbeat, type HostFleetReachabilityStatus } from '@narada-core/host-fleet';

export interface StoredHostFleetObservation {
  heartbeat: HostFleetHeartbeat;
  received_at: string;
}

export interface StoredHostFleetProbe {
  host_id: string;
  status: HostFleetReachabilityStatus;
  observed_at: string;
}

export class HostFleetReplayRefusal extends Error {
  readonly code = 'host_fleet_heartbeat_replay';
  constructor() {
    super('Host Fleet heartbeat nonce was already admitted.');
    this.name = 'HostFleetReplayRefusal';
  }
}

function row(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('host_fleet_store_row_invalid');
  return value as Record<string, unknown>;
}

export class HostFleetSqliteStore {
  readonly path: string;
  private readonly db: Database;

  constructor(path: string) {
    this.path = path;
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(`
      create table if not exists host_fleet_observation (
        host_id text primary key,
        received_at text not null,
        heartbeat_json text not null
      );
      create table if not exists host_fleet_probe (
        host_id text primary key,
        status text not null,
        observed_at text not null
      );
      create table if not exists host_fleet_nonce (
        key_id text not null,
        nonce text not null,
        received_at text not null,
        primary key (key_id, nonce)
      );
    `);
  }

  admit(input: { heartbeat: HostFleetHeartbeat; key_id: string; nonce: string; received_at: string; nonce_cutoff: string }): void {
    const heartbeat = validateHostFleetHeartbeat(input.heartbeat);
    this.db.transaction(() => {
      this.db.prepare('delete from host_fleet_nonce where received_at < ?').run(input.nonce_cutoff);
      const nonce = this.db.prepare(
        'insert or ignore into host_fleet_nonce (key_id, nonce, received_at) values (?, ?, ?)',
      ).run(input.key_id, input.nonce, input.received_at);
      if (nonce.changes !== 1) throw new HostFleetReplayRefusal();
      this.db.prepare(`
        insert into host_fleet_observation (host_id, received_at, heartbeat_json)
        values (?, ?, ?)
        on conflict(host_id) do update set received_at=excluded.received_at, heartbeat_json=excluded.heartbeat_json
        where excluded.received_at >= host_fleet_observation.received_at
      `).run(heartbeat.host_id, input.received_at, JSON.stringify(heartbeat));
    })();
  }

  recordProbe(probe: StoredHostFleetProbe): void {
    this.db.prepare(`
      insert into host_fleet_probe (host_id, status, observed_at)
      values (?, ?, ?)
      on conflict(host_id) do update set status=excluded.status, observed_at=excluded.observed_at
      where excluded.observed_at >= host_fleet_probe.observed_at
    `).run(probe.host_id, probe.status, probe.observed_at);
  }

  observations(): Map<string, StoredHostFleetObservation> {
    const result = new Map<string, StoredHostFleetObservation>();
    for (const candidate of this.db.prepare('select host_id, received_at, heartbeat_json from host_fleet_observation').all()) {
      const parsed = row(candidate);
      const heartbeat = validateHostFleetHeartbeat(JSON.parse(String(parsed.heartbeat_json)));
      result.set(String(parsed.host_id), { heartbeat, received_at: String(parsed.received_at) });
    }
    return result;
  }

  probes(): Map<string, StoredHostFleetProbe> {
    const result = new Map<string, StoredHostFleetProbe>();
    for (const candidate of this.db.prepare('select host_id, status, observed_at from host_fleet_probe').all()) {
      const parsed = row(candidate);
      const status = String(parsed.status);
      if (status !== 'reachable' && status !== 'unreachable' && status !== 'unknown') continue;
      result.set(String(parsed.host_id), { host_id: String(parsed.host_id), status, observed_at: String(parsed.observed_at) });
    }
    return result;
  }

  close(): void {
    this.db.close();
  }
}
