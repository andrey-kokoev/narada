import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatSiteMembershipPutText,
  parseSiteMembershipPutArgs,
  putCloudflareSiteMembership,
} from './cloudflare-carrier-site-membership-put.mjs';

test('parseSiteMembershipPutArgs requires explicit membership target and role', () => {
  assert.throws(
    () => parseSiteMembershipPutArgs([
      '--url', 'https://carrier.example',
      '--site', 'site_alpha',
      '--token', 'token-value',
    ], {}),
    /site_membership_put_requires_--member-principal-id/,
  );

  assert.throws(
    () => parseSiteMembershipPutArgs([
      '--url', 'https://carrier.example',
      '--site', 'site_alpha',
      '--member-principal-id', 'principal:alpha',
      '--token', 'token-value',
    ], {}),
    /site_membership_put_requires_--role/,
  );
});

test('parseSiteMembershipPutArgs builds membership write request', () => {
  const parsed = parseSiteMembershipPutArgs([
    '--url', 'https://carrier.example/',
    '--site', 'site_alpha',
    '--member-principal-id', 'principal:alpha',
    '--role', 'viewer',
    '--operator-session-cookie', 'operator-session-cookie',
  ], {}, () => 42);

  assert.equal(parsed.workerUrl, 'https://carrier.example');
  assert.equal(parsed.requestId, 'site_membership_put_site_alpha_42');
  assert.deepEqual(parsed.params, {
    site_id: 'site_alpha',
    member_principal_id: 'principal:alpha',
    role: 'viewer',
    status: 'active',
  });
});

test('putCloudflareSiteMembership posts governed site.membership.put envelope', async () => {
  const calls = [];
  const result = await putCloudflareSiteMembership({
    workerUrl: 'https://carrier.example',
    requestId: 'request_site_membership_put',
    auth: { kind: 'bearer', value: 'token-value', source: 'flag:--token' },
    params: {
      site_id: 'site_alpha',
      member_principal_id: 'principal:alpha',
      role: 'viewer',
      status: 'active',
    },
  }, async (url, init) => {
    calls.push({ url: url.toString(), init });
    return {
      status: 200,
      async text() {
        return JSON.stringify({
          membership: {
            site_id: 'site_alpha',
            principal_id: 'principal:alpha',
            role: 'viewer',
            status: 'active',
            updated_at: '2026-06-13T20:00:00.000Z',
          },
          principal: {
            principal_id: 'admin',
            email: 'admin@example.test',
          },
          site_authority_decision: {
            action: 'admit',
            authority_locus_kind: 'cloudflare_site_registry',
          },
        });
      },
    };
  });

  assert.equal(calls[0].url, 'https://carrier.example/api/carrier');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    operation: 'site.membership.put',
    request_id: 'request_site_membership_put',
    params: {
      site_id: 'site_alpha',
      member_principal_id: 'principal:alpha',
      role: 'viewer',
      status: 'active',
    },
  });
  assert.equal(result.summary.member_principal_id, 'principal:alpha');
  assert.equal(result.summary.decision_action, 'admit');
});

test('formatSiteMembershipPutText renders governed membership summary', () => {
  const text = formatSiteMembershipPutText({
    worker_url: 'https://carrier.example',
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      member_principal_id: 'principal:alpha',
      membership_role: 'viewer',
      membership_status: 'active',
      actor_principal_id: 'admin',
      actor_email: 'admin@example.test',
      decision_action: 'admit',
      authority_locus_kind: 'cloudflare_site_registry',
      updated_at: '2026-06-13T20:00:00.000Z',
    },
  });

  assert.match(text, /Site Membership Put: ok/);
  assert.match(text, /Member: principal:alpha/);
  assert.match(text, /Role: viewer/);
  assert.match(text, /Authority Decision: action=admit locus=cloudflare_site_registry/);
  assert.match(text, /Site Read: pnpm --filter @narada2\/cloudflare-carrier product:site:read:text -- --url https:\/\/carrier\.example --site site_alpha --operator-session-file <operator-session-file>/);
  assert.match(text, /Site Next Workflow: pnpm --filter @narada2\/cloudflare-carrier product:site:next:workflow:live:text -- --url https:\/\/carrier\.example --site site_alpha --operator-session-file <operator-session-file> --execute-site-next/);
});

test('formatSiteMembershipPutText suppresses site handoff without worker url', () => {
  const text = formatSiteMembershipPutText({
    auth_source: 'operator-session-file',
    summary: {
      site_id: 'site_alpha',
      member_principal_id: 'principal:alpha',
      membership_role: 'viewer',
      membership_status: 'active',
      decision_action: 'admit',
      authority_locus_kind: 'cloudflare_site_registry',
    },
  });

  assert.doesNotMatch(text, /Site Read:/);
  assert.doesNotMatch(text, /Site Next Workflow:/);
});
