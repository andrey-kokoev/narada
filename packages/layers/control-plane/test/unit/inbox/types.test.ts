import { describe, expect, it } from 'vitest';
import {
  createInboxEnvelope,
  isActionableInboxCommandRequest,
  isInertReceivedInboxEnvelope,
  isPromotedInboxEnvelope,
  promoteInboxEnvelope,
  type InboxEnvelope,
} from '../../../src/inbox/types.js';

describe('Canonical Inbox envelope types', () => {
  it('creates received, unpromoted envelopes by default', () => {
    const envelope = createInboxEnvelope({
      envelope_id: 'env_1',
      received_at: '2026-04-26T22:00:00.000Z',
      source: { kind: 'diagnostic', ref: 'komorebi:rdp-display-recovery' },
      kind: 'observation',
      payload: { hostname: 'desktop-sunroom-2', computer_name: 'DESKTOP-SUNROOM' },
    });

    expect(envelope.status).toBe('received');
    expect(envelope.authority).toEqual({ level: 'none' });
    expect(envelope.promotion).toBeUndefined();
    expect(isInertReceivedInboxEnvelope(envelope)).toBe(true);
    expect(isPromotedInboxEnvelope(envelope)).toBe(false);
  });

  it('promotes by adding target metadata without changing source or payload', () => {
    const payload = { issue: 'hostname and COMPUTERNAME alias policy missing' };
    const envelope = createInboxEnvelope({
      envelope_id: 'env_2',
      received_at: '2026-04-26T22:05:00.000Z',
      source: { kind: 'user_chat', ref: 'chat:turn-123', site_id: 'desktop-sunroom-2' },
      kind: 'upstream_task_candidate',
      authority: { level: 'user_statement', principal: 'operator' },
      payload,
    });

    const promoted = promoteInboxEnvelope(envelope, {
      target_kind: 'task',
      target_ref: 'task:future-windows-pc-site-identity-policy',
      promoted_at: '2026-04-26T22:06:00.000Z',
      promoted_by: 'operator',
    });

    expect(promoted.status).toBe('promoted');
    expect(promoted.source).toEqual(envelope.source);
    expect(promoted.payload).toBe(payload);
    expect(promoted.promotion?.target_kind).toBe('task');
    expect(isPromotedInboxEnvelope(promoted)).toBe(true);
  });

  it('classifies actionable command requests separately from inert observations', () => {
    const commandRequest: InboxEnvelope = createInboxEnvelope({
      envelope_id: 'env_3',
      received_at: '2026-04-26T22:10:00.000Z',
      source: { kind: 'cli', ref: 'narada inbox submit' },
      kind: 'command_request',
      authority: { level: 'operator_confirmed', principal: 'operator' },
      payload: { command: 'create task' },
    });
    const observation = createInboxEnvelope({
      envelope_id: 'env_4',
      received_at: '2026-04-26T22:11:00.000Z',
      source: { kind: 'system_observation', ref: 'site-doctor:desktop-sunroom-2' },
      kind: 'observation',
      payload: { status: 'ok' },
    });

    expect(isActionableInboxCommandRequest(commandRequest)).toBe(true);
    expect(isInertReceivedInboxEnvelope(commandRequest)).toBe(true);
    expect(isActionableInboxCommandRequest(observation)).toBe(false);
    expect(isInertReceivedInboxEnvelope(observation)).toBe(true);
  });
});
