import { describe, expect, it } from 'vitest';
import {
  validateConfig,
  validateConfigOrThrow,
  isValidConfig,
  ConfigSchema,
} from '../../../src/config/schema.js';

describe('Config Schema Validation', () => {
  const validConfig = {
    mailbox_id: 'test@example.com',
    root_dir: './data',
    graph: {
      user_id: 'test@example.com',
      prefer_immutable_ids: true,
    },
    scope: {
      included_container_refs: ['inbox'],
      included_item_kinds: ['message'],
    },
  };

  describe('validateConfig', () => {
    it('validates a minimal valid config', () => {
      const result = validateConfig(validConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mailbox_id).toBe('test@example.com');
        expect(result.data.graph.user_id).toBe('test@example.com');
      }
    });

    it('applies default values for optional fields', () => {
      const result = validateConfig(validConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.normalize.attachment_policy).toBe('metadata_only');
        expect(result.data.normalize.body_policy).toBe('text_only');
        expect(result.data.normalize.include_headers).toBe(false);
        expect(result.data.normalize.tombstones_enabled).toBe(true);
        expect(result.data.runtime.polling_interval_ms).toBe(60000);
        expect(result.data.runtime.acquire_lock_timeout_ms).toBe(30000);
        expect(result.data.runtime.cleanup_tmp_on_startup).toBe(true);
        expect(result.data.runtime.rebuild_views_after_sync).toBe(false);
      }
    });

    it('validates a complete config with all fields', () => {
      const fullConfig = {
        mailbox_id: 'test@example.com',
        root_dir: './data',
        graph: {
          tenant_id: 'tenant-1',
          client_id: 'client-1',
          client_secret: 'secret-1',
          user_id: 'test@example.com',
          base_url: 'https://graph.microsoft.com/v1.0',
          prefer_immutable_ids: true,
        },
        scope: {
          included_container_refs: ['inbox', 'sentitems'],
          included_item_kinds: ['message'],
        },
        normalize: {
          attachment_policy: 'include_content',
          body_policy: 'text_and_html',
          include_headers: true,
          tombstones_enabled: false,
        },
        runtime: {
          polling_interval_ms: 30000,
          acquire_lock_timeout_ms: 15000,
          cleanup_tmp_on_startup: false,
          rebuild_views_after_sync: true,
        },
      };

      const result = validateConfig(fullConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.graph.tenant_id).toBe('tenant-1');
        expect(result.data.normalize.attachment_policy).toBe('include_content');
        expect(result.data.runtime.polling_interval_ms).toBe(30000);
      }
    });

    it('rejects missing mailbox_id', () => {
      const result = validateConfig({
        ...validConfig,
        mailbox_id: undefined,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.formatted).toContain('mailbox_id: Required');
      }
    });

    it('rejects empty mailbox_id', () => {
      const result = validateConfig({
        ...validConfig,
        mailbox_id: '',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.formatted.some((e) => e.includes('mailbox_id'))).toBe(true);
      }
    });

    it('rejects missing root_dir', () => {
      const result = validateConfig({
        ...validConfig,
        root_dir: undefined,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.formatted).toContain('root_dir: Required');
      }
    });

    it('rejects missing graph object', () => {
      const result = validateConfig({
        ...validConfig,
        graph: undefined,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.formatted).toContain('graph: Required');
      }
    });

    it('rejects missing graph.user_id', () => {
      const result = validateConfig({
        ...validConfig,
        graph: { prefer_immutable_ids: true },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.formatted).toContain('graph.user_id: Required');
      }
    });

    it('rejects invalid attachment_policy', () => {
      const result = validateConfig({
        ...validConfig,
        normalize: {
          attachment_policy: 'invalid_policy',
        },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.formatted.some((e) => e.includes('attachment_policy'))).toBe(true);
      }
    });

    it('rejects invalid body_policy', () => {
      const result = validateConfig({
        ...validConfig,
        normalize: {
          body_policy: 'invalid_policy',
        },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.formatted.some((e) => e.includes('body_policy'))).toBe(true);
      }
    });

    it('rejects empty scope.included_container_refs', () => {
      const result = validateConfig({
        ...validConfig,
        scope: {
          included_container_refs: [],
          included_item_kinds: ['message'],
        },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.formatted.some((e) => e.includes('included_container_refs'))).toBe(true);
      }
    });

    it('rejects empty scope.included_item_kinds', () => {
      const result = validateConfig({
        ...validConfig,
        scope: {
          included_container_refs: ['inbox'],
          included_item_kinds: [],
        },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.formatted.some((e) => e.includes('included_item_kinds'))).toBe(true);
      }
    });

    it('rejects negative polling_interval_ms', () => {
      const result = validateConfig({
        ...validConfig,
        runtime: {
          polling_interval_ms: -1,
        },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.formatted.some((e) => e.includes('polling_interval_ms'))).toBe(true);
      }
    });

    it('rejects polling_interval_ms less than 1000', () => {
      const result = validateConfig({
        ...validConfig,
        runtime: {
          polling_interval_ms: 500,
        },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.formatted.some((e) => e.includes('polling_interval_ms'))).toBe(true);
      }
    });

    it('rejects invalid base_url', () => {
      const result = validateConfig({
        ...validConfig,
        graph: {
          ...validConfig.graph,
          base_url: 'not-a-valid-url',
        },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.formatted.some((e) => e.includes('base_url'))).toBe(true);
      }
    });
  });

  describe('validateConfigOrThrow', () => {
    it('returns data for valid config', () => {
      const result = validateConfigOrThrow(validConfig);
      expect(result.mailbox_id).toBe('test@example.com');
    });

    it('throws for invalid config', () => {
      expect(() =>
        validateConfigOrThrow({
          ...validConfig,
          mailbox_id: undefined,
        }),
      ).toThrow(/Configuration validation failed/);
    });
  });

  describe('isValidConfig', () => {
    it('returns true for valid config', () => {
      expect(isValidConfig(validConfig)).toBe(true);
    });

    it('returns false for invalid config', () => {
      expect(isValidConfig({ ...validConfig, mailbox_id: undefined })).toBe(false);
    });
  });

  describe('ConfigSchema', () => {
    it('validates all valid attachment policies', () => {
      const policies = ['exclude', 'metadata_only', 'include_content'];
      for (const policy of policies) {
        const result = ConfigSchema.safeParse({
          ...validConfig,
          normalize: { attachment_policy: policy },
        });
        expect(result.success).toBe(true);
      }
    });

    it('validates all valid body policies', () => {
      const policies = ['text_only', 'html_only', 'text_and_html'];
      for (const policy of policies) {
        const result = ConfigSchema.safeParse({
          ...validConfig,
          normalize: { body_policy: policy },
        });
        expect(result.success).toBe(true);
      }
    });

    it('validates charter runtime config', () => {
      const result = ConfigSchema.safeParse({
        ...validConfig,
        charter: {
          runtime: 'codex-api',
          api_key: 'sk-test',
          model: 'gpt-4',
          base_url: 'https://api.openai.com/v1',
          timeout_ms: 30000,
        },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.charter.runtime).toBe('codex-api');
        expect(result.data.charter.api_key).toBe('sk-test');
        expect(result.data.charter.model).toBe('gpt-4');
      }
    });

    it('validates mailbox policy', () => {
      const result = ConfigSchema.safeParse({
        ...validConfig,
        policy: {
          primary_charter: 'obligation_keeper',
          secondary_charters: ['support_steward'],
          allowed_actions: ['send_reply', 'no_action'],
          allowed_tools: ['echo_test'],
          require_human_approval: true,
        },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.policy.primary_charter).toBe('obligation_keeper');
        expect(result.data.policy.allowed_actions).toEqual(['send_reply', 'no_action']);
        expect(result.data.policy.require_human_approval).toBe(true);
      }
    });

    it('rejects invalid allowed_actions in policy', () => {
      const result = validateConfig({
        ...validConfig,
        policy: {
          allowed_actions: ['invalid_action'],
        },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.formatted.some((e) => e.includes('allowed_actions'))).toBe(true);
      }
    });

    it('rejects empty allowed_actions in policy', () => {
      const result = validateConfig({
        ...validConfig,
        policy: {
          allowed_actions: [],
        },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.formatted.some((e) => e.includes('allowed_actions'))).toBe(true);
      }
    });

    it('validates webhook config when enabled', () => {
      const result = ConfigSchema.safeParse({
        ...validConfig,
        webhook: {
          enabled: true,
          public_url: 'https://example.com/webhook',
          port: 3000,
          client_state: 'secret',
          auto_renew: true,
        },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.webhook?.enabled).toBe(true);
        expect(result.data.webhook?.public_url).toBe('https://example.com/webhook');
      }
    });

    it('rejects enabled webhook without required fields', () => {
      const result = validateConfig({
        ...validConfig,
        webhook: {
          enabled: true,
        },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.formatted.some((e) => e.includes('webhook'))).toBe(true);
      }
    });
  });
});
