import { describe, expect, it } from 'vitest';
import { consoleMirrorRuntimeOptions } from '../../src/commands/console-mirror.js';

describe('console mirror command wiring', () => {
  it('preserves the dedicated Host Gateway credential for the mirror runtime', () => {
    expect(consoleMirrorRuntimeOptions({
      host_gateway_token: 'host-gateway-token',
    })).toMatchObject({
      host_gateway_token: 'host-gateway-token',
    });
  });
});
