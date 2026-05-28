import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TO_DATA_PACKET_SCHEMA,
  TO_DATA_READ_FAMILIES,
  buildToDataPacketFixture,
  validateToDataPacket,
} from './to-data-packet.mjs';

test('to-data packet fixtures cover every admitted read family', () => {
  assert.deepEqual(TO_DATA_READ_FAMILIES, [
    'task_packet',
    'work_next_peek',
    'inbox_summary',
    'readiness_snapshot',
    'evidence_ref_summary',
    'bounded_file_excerpt',
  ]);

  for (const family of TO_DATA_READ_FAMILIES) {
    const packet = buildToDataPacketFixture(family);
    assert.equal(packet.schema, TO_DATA_PACKET_SCHEMA);
    assert.equal(packet.read_family, family);
    assert.equal(packet.raw_values_recorded, false);
    assert.equal(packet.authority_mutation_performed, false);
    assert.equal(packet.capability_ref.posture, 'projected_not_secret');
    assert.equal(packet.attribution.observed_by, 'narada-native-carrier');
    assert.equal(packet.freshness.posture, 'bounded_snapshot');
    assert.equal(typeof packet.bounded_summary.excerpt, 'string');
    assert.deepEqual(validateToDataPacket(packet), []);
  }
});

test('to-data packet validation rejects raw values and mutation flags', () => {
  const packet = buildToDataPacketFixture('task_packet', {
    raw_values_recorded: true,
    authority_mutation_performed: true,
    bounded_summary: { raw_value: 'unbounded secret or transcript' },
  });

  assert.deepEqual(validateToDataPacket(packet), [
    'raw_values_recorded must be false',
    'authority_mutation_performed must be false',
    'bounded_summary must not include raw_value',
  ]);
});
