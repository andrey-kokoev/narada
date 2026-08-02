import { describe, expect, it } from 'vitest';
import {
  buildOperatorConsoleMirrorDeployPlan,
  operatorConsoleMirrorDeployInputFromEnv,
  operatorConsoleMirrorChildOptions,
  OperatorConsoleMirrorDeployError,
} from '../scripts/operator-console-mirror-deploy.js';

describe('operator console mirror deployment preflight', () => {
  it('builds a plan with matching HTTPS origins and a protected Access contract', () => {
    const plan = buildOperatorConsoleMirrorDeployPlan({
      gateway_url: 'https://operator-console-origin.narada.systems/',
      gateway_origin_pin: 'https://operator-console-origin.narada.systems',
      gateway_token: 'shared-bridge-token',
      bridge_token: 'shared-bridge-token',
      access_required: true,
      access_team_domain: 'https://narada.cloudflareaccess.com/',
      access_audience: 'operator-console-audience',
    });
    expect(plan.variables).toEqual({
      OPERATOR_CONSOLE_GATEWAY_URL: 'https://operator-console-origin.narada.systems',
      OPERATOR_CONSOLE_GATEWAY_ORIGIN_PIN: 'https://operator-console-origin.narada.systems',
      OPERATOR_CONSOLE_GATEWAY_TRANSPORT: 'public-tunnel',
      OPERATOR_CONSOLE_ACCESS_REQUIRED: 'true',
      OPERATOR_CONSOLE_ACCESS_TEAM_DOMAIN: 'https://narada.cloudflareaccess.com',
      OPERATOR_CONSOLE_ACCESS_AUDIENCE: 'operator-console-audience',
    });
    expect(plan.secret_names).toEqual(['OPERATOR_CONSOLE_GATEWAY_TOKEN']);
  });

  it('allows an explicit HTTP origin only for a private VPC gateway transport', () => {
    const plan = buildOperatorConsoleMirrorDeployPlan({
      gateway_url: 'http://operator-console.internal',
      gateway_origin_pin: 'http://operator-console.internal',
      gateway_transport: 'vpc-service',
      gateway_token: 'shared-bridge-token',
      bridge_token: 'shared-bridge-token',
      access_required: true,
      access_team_domain: 'https://narada.cloudflareaccess.com/',
      access_audience: 'operator-console-audience',
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
      access_required: false,
      access_team_domain: 'https://team.cloudflareaccess.com',
      access_audience: '',
    })).toThrowError(OperatorConsoleMirrorDeployError);
    try {
      buildOperatorConsoleMirrorDeployPlan({
        gateway_url: 'https://origin.example.test',
        gateway_origin_pin: 'https://different.example.test',
        gateway_token: 'worker-token',
        bridge_token: 'local-token',
        access_required: false,
        access_team_domain: 'https://team.cloudflareaccess.com',
        access_audience: '',
      });
    } catch (error) {
      expect(error).toBeInstanceOf(OperatorConsoleMirrorDeployError);
      expect((error as OperatorConsoleMirrorDeployError).validation_errors).toEqual(expect.arrayContaining([
        'gateway_url_and_origin_pin_must_match',
        'access_audience_required',
        'access_required_must_be_true',
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
      OPERATOR_CONSOLE_ACCESS_TEAM_DOMAIN: 'https://team.cloudflareaccess.com',
      OPERATOR_CONSOLE_ACCESS_AUDIENCE: 'audience',
    });
    expect(input.access_required).toBe('true');
    expect(input.gateway_url).toBe('https://origin.example.test');
    expect(input.gateway_transport).toBe('vpc-service');
    expect(input.gateway_token).toBe('token');
  });

  it('uses shell mediation only for Windows command shims', () => {
    expect(operatorConsoleMirrorChildOptions('pnpm.cmd', 'D:/code/narada', 'win32')).toMatchObject({
      cwd: 'D:/code/narada',
      shell: true,
      windowsHide: true,
    });
    expect(operatorConsoleMirrorChildOptions('pnpm', 'D:/code/narada', 'win32').shell).toBe(false);
    expect(operatorConsoleMirrorChildOptions('pnpm.cmd', 'D:/code/narada', 'linux').shell).toBe(false);
  });
});
