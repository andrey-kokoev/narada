import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { payloadCreate } from '../mcp-payload-file.mjs';
import { createLiftPackageFromPayloadRef } from './create-lift-package.mjs';
import { sendLiftPackage } from './send-lift-package.mjs';

test('site lift records package creation and full receiving admission path', () => {
  const sourceRoot = mkdtempSync(join(tmpdir(), 'narada-site-lift-source-'));
  const targetRoot = mkdtempSync(join(tmpdir(), 'narada-site-lift-target-'));
  try {
    const packagePayload = payloadCreate({
      siteRoot: sourceRoot,
      args: {
        payload: {
          schema: 'narada.payload.site_lift.package.v1',
          package_id: 'fsm-contract-lift',
          title: 'FSM contract lift',
          purpose: 'Transfer a bounded FSM contract.',
          source_site: 'source-site',
          target_site: 'target-site',
          sections: [{ heading: 'Contract', body: 'Admit lifecycle evidence at the receiving Site.' }],
        },
      },
    });
    const created = createLiftPackageFromPayloadRef({ siteRoot: sourceRoot, payloadRef: packagePayload.ref });
    assert.equal(created.status, 'created');
    assert.equal(created.lifecycle_state, 'created');
    assert.deepEqual(created.lifecycle_history, ['requested', 'validating', 'planned', 'created']);
    assert.equal(existsSync(join(sourceRoot, created.paths.package_markdown)), true);
    const metadata = JSON.parse(readFileSync(join(sourceRoot, created.paths.metadata_sidecar), 'utf8'));
    assert.equal(metadata.lifecycle_state, 'created');

    const sendPayload = payloadCreate({
      siteRoot: sourceRoot,
      args: {
        payload: {
          schema: 'narada.payload.site_lift.send.v1',
          package_id: 'fsm-contract-lift',
          package_markdown_path: created.paths.package_markdown,
          metadata_path: created.paths.metadata_sidecar,
          source_site: 'source-site',
          target_site: 'target-site',
          target_site_root: targetRoot,
          target_admission_guidance: 'Review and admit this package locally.',
          package_payload_ref: packagePayload.ref,
        },
      },
    });
    const sent = sendLiftPackage({ siteRoot: sourceRoot, payloadRef: sendPayload.ref, targetSiteRoot: targetRoot });
    assert.equal(sent.status, 'sent');
    assert.equal(sent.lifecycle_state, 'admitted');
    assert.deepEqual(sent.lifecycle_history, [
      'requested',
      'validating',
      'planned',
      'sending',
      'sent',
      'receiving',
      'received',
      'admitting',
      'admitted',
    ]);
    assert.equal(sent.target_admission.event_sequence, 2);
    assert.equal(sent.target_admission.event_id.startsWith('evt_'), true);
    assert.equal(sent.send_record.lifecycle_state, 'admitted');
  } finally {
    rmSync(sourceRoot, { recursive: true, force: true });
    rmSync(targetRoot, { recursive: true, force: true });
  }
});
