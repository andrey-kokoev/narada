/**
 * Tests for retention policy
 */

import { describe, it, expect } from 'vitest';
import type { RetentionPolicy } from '../../../src/lifecycle/types.js';

describe('retention policy', () => {
  describe('parseSize', () => {
    it('should parse various size formats', async () => {
      const { parseSize } = await import('../../../src/lifecycle/retention.js');
      
      expect(parseSize('100')).toBe(100);
      expect(parseSize('10KB')).toBe(10 * 1024);
      expect(parseSize('100MB')).toBe(100 * 1024 * 1024);
      expect(parseSize('10GB')).toBe(10 * 1024 * 1024 * 1024);
    });
    
    it('should throw on invalid size', async () => {
      const { parseSize } = await import('../../../src/lifecycle/retention.js');
      
      expect(() => parseSize('invalid')).toThrow();
    });
  });
});
