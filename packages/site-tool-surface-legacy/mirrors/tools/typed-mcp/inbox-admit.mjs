#!/usr/bin/env node
/**
 * Inbox Admit CLI
 *
 * Admits an envelope into the canonical inbox and appends an admission log event.
 *
 * Usage:
 *   node inbox-admit.mjs <cwd> <envelope-json-file>
 */

import { readFileSync } from 'node:fs';
import { assertKnownInboxEnvelopeKind } from '../inbox/envelope-kinds.mjs';
import { admitEnvelope } from '../inbox/admission-log.mjs';

const cwd = process.argv[2] || process.cwd();
const envelopeFile = process.argv[3];

if (!envelopeFile) {
  console.error(JSON.stringify({ status: 'error', error: 'envelope_file_required' }, null, 2));
  process.exit(1);
}

try {
  const envelopeJson = readFileSync(envelopeFile, 'utf8');
  const envelope = JSON.parse(envelopeJson);
  assertKnownInboxEnvelopeKind(envelope.kind ?? 'observation');
  const result = admitEnvelope(cwd, envelope);
  console.log(JSON.stringify({
    status: 'admitted',
    envelope_id: envelope.envelope_id,
    event_id: result.event.event_id,
    event_seq: result.event.event_seq,
    envelope_path: result.envelopePath,
  }, null, 2));
} catch (err) {
  console.error(JSON.stringify({
    status: 'error',
    error: err instanceof Error ? err.message : String(err),
  }, null, 2));
  process.exit(1);
}
