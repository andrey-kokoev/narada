import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const contract = readFileSync(new URL('../../../docs/product/site-operational-dashboard-generator.v0.md', import.meta.url), 'utf8');

describe('site operational dashboard docs contract', () => {
  it('documents observation/no-authority and no-secret posture', () => {
    expect(readme).toContain('The dashboard is an observation surface.');
    expect(readme).toContain('does not admit evidence');
    expect(readme).toMatch(/does not read local Site files[\s\S]*expose mutation controls/);
    expect(readme).toContain('Provider details must be bounded summaries.');
    expect(readme).toMatch(/Capability refs and\s+secret refs are allowed only as references, not values\./);
  });

  it('documents Staccato lift boundary without making Staccato defaults generic', () => {
    expect(readme).toContain('## Staccato Lift Boundary');
    expect(readme).toContain('Reusable mechanics lifted from Staccato');
    expect(readme).toContain('Not lifted into generic defaults');
    expect(readme).toContain('Klaviyo');
    expect(readme).toContain('BigCommerce');
  });

  it('documents local live-server token cache posture and limits', () => {
    expect(readme).toContain('Bind local live servers to `127.0.0.1` by default.');
    expect(readme).toContain('bearer-token guarded');
    expect(readme).toContain('localStorage');
    expect(readme).toContain('clear-token control');
    expect(readme).toMatch(/not a\s+secure secret store/);
    expect(readme).toContain('not a durable Narada capability registry');
  });

  it('keeps the product contract anchored on observation rather than authority', () => {
    expect(contract).toContain('dashboard rows are observations');
    expect(contract).toContain('must not mutate tasks, inbox, outbox, runtime state, credentials, external');
    expect(contract).toContain('copy Staccato-specific row providers');
  });
});
