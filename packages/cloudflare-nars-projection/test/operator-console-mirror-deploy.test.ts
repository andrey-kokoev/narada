import { describe, expect, it } from 'vitest';
import {
  buildOperatorConsoleMirrorDeployPlan,
  operatorConsoleMirrorDeployInputFromEnv,
  OperatorConsoleMirrorDeployError,
} from '../scripts/operator-console-mirror-deploy.js';

describe('operator console mirror deployment preflight', () => {
  it('builds a plan with matching HTTPS origins and a Narada shared-secret contract', () => {
    const plan = buildOperatorConsoleMirrorDeployPlan({
      gateway_url: 'https://operator-console-origin.narada.systems/',
      gateway_origin_pin: 'https://operator-console-origin.narada.systems',
      gateway_token: 'shared-bridge-token',
      bridge_token: 'shared-bridge-token',
      operator_console_shared_secret: 'operator-console-shared-secret',
    });
    expect(plan.variables).toEqual({
      OPERATOR_CONSOLE_GATEWAY_URL: 'https://operator-console-origin.narada.systems',
      OPERATOR_CONSOLE_GATEWAY_ORIGIN_PIN: 'https://operator-console-origin.narada.systems',
      OPERATOR_CONSOLE_GATEWAY_TRANSPORT: 'public-tunnel',
    });
    expect(plan.secret_names).toEqual(['NARADA_OPERATOR_CONSOLE_SHARED_SECRET', 'OPERATOR_CONSOLE_GATEWAY_TOKEN']);
  });

  it('allows an explicit HTTP origin only for a private VPC gateway transport', () => {
    const plan = buildOperatorConsoleMirrorDeployPlan({
      gateway_url: 'http://operator-console.internal',
      gateway_origin_pin: 'http://operator-console.internal',
      gateway_transport: 'vpc-service',
      gateway_token: 'shared-bridge-token',
      bridge_token: 'shared-bridge-token',
      operator_console_shared_secret: 'operator-console-shared-secret',
    });
    expect(plan.variables.OPERATOR_CONSOLE_GATEWAY_TRANSPORT).toBe('vpc-service');
    expect(plan.variables.OPERATOR_CONSOLE_GATEWAY_URL).toBe('http://operator-console.internal');
  });

  it('rejects an unprotected or mismatched deployment before mutation', () => {
    expect(() => buildOperatorConsoleMirrorDeployPlan({
      gateway_url: 'https://origin.example.test',
      gateway_origin_pin: 'https://different.example.test',
      gateway_token: 'worker-token',
      bridge_token: 'local-token',
      operator_console_shared_secret: '',
    })).toThrowError(OperatorConsoleMirrorDeployError);
    try {
      buildOperatorConsoleMirrorDeployPlan({
        gateway_url: 'https://origin.example.test',
        gateway_origin_pin: 'https://different.example.test',
        gateway_token: 'worker-token',
        bridge_token: 'local-token',
        operator_console_shared_secret: '',
      });
    } catch (error) {
      expect(error).toBeInstanceOf(OperatorConsoleMirrorDeployError);
      expect((error as OperatorConsoleMirrorDeployError).validation_errors).toEqual(expect.arrayContaining([
        'gateway_url_and_origin_pin_must_match',
        'operator_console_shared_secret_required',
        'gateway_token_and_bridge_token_must_match',
      ]));
    }
  });

  it('reads the deployment contract from environment names without exposing values', () => {
    const input = operatorConsoleMirrorDeployInputFromEnv({
      OPERATOR_CONSOLE_GATEWAY_URL: 'https://origin.example.test',
      OPERATOR_CONSOLE_GATEWAY_ORIGIN_PIN: 'https://origin.example.test',
      OPERATOR_CONSOLE_GATEWAY_TOKEN: 'token',
      OPERATOR_CONSOLE_GATEWAY_TRANSPORT: 'vpc-service',
      NARADA_OPERATOR_CONSOLE_BRIDGE_TOKEN: 'token',
      NARADA_OPERATOR_CONSOLE_SHARED_SECRET: 'operator-console-shared-secret',
    });
    expect(input.operator_console_shared_secret).toBe('operator-console-shared-secret');
    expect(input.gateway_url).toBe('https://origin.example.test');
    expect(input.gateway_transport).toBe('vpc-service');
    expect(input.gateway_token).toBe('token');
  });
});
