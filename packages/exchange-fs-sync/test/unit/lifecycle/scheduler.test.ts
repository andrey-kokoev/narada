/**
 * Tests for cleanup scheduler
 */

import { describe, it, expect } from 'vitest';
import {
  shouldRunCleanup,
  getNextRunTime,
  parseSize,
} from '../../../src/lifecycle/index.js';
import type { CleanupSchedule } from '../../../src/lifecycle/types.js';

describe('scheduler', () => {
  describe('shouldRunCleanup', () => {
    it('should run if never run before', () => {
      const schedule: CleanupSchedule = {
        frequency: 'daily',
        maxRunTimeMinutes: 60,
      };
      
      expect(shouldRunCleanup(schedule, null)).toBe(true);
    });
    
    it('should run daily if 20+ hours passed', () => {
      const schedule: CleanupSchedule = {
        frequency: 'daily',
        maxRunTimeMinutes: 60,
      };
      const lastRun = new Date(Date.now() - 21 * 60 * 60 * 1000);
      
      expect(shouldRunCleanup(schedule, lastRun)).toBe(true);
    });
    
    it('should not run daily if less than 20 hours passed', () => {
      const schedule: CleanupSchedule = {
        frequency: 'daily',
        maxRunTimeMinutes: 60,
      };
      const lastRun = new Date(Date.now() - 10 * 60 * 60 * 1000);
      
      expect(shouldRunCleanup(schedule, lastRun)).toBe(false);
    });
    
    it('should run weekly if 6+ days passed', () => {
      const schedule: CleanupSchedule = {
        frequency: 'weekly',
        maxRunTimeMinutes: 60,
      };
      const lastRun = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      
      expect(shouldRunCleanup(schedule, lastRun)).toBe(true);
    });
    
    it('should not run manual frequency', () => {
      const schedule: CleanupSchedule = {
        frequency: 'manual',
        maxRunTimeMinutes: 60,
      };
      
      expect(shouldRunCleanup(schedule, null)).toBe(false);
    });
    
    it('should respect time window', () => {
      const schedule: CleanupSchedule = {
        frequency: 'daily',
        maxRunTimeMinutes: 60,
        timeWindow: { start: '02:00', end: '04:00' },
      };
      
      // 3 AM - should run
      const threeAm = new Date('2024-01-15T03:00:00');
      expect(shouldRunCleanup(schedule, null, threeAm)).toBe(true);
      
      // 10 AM - should not run
      const tenAm = new Date('2024-01-15T10:00:00');
      expect(shouldRunCleanup(schedule, null, tenAm)).toBe(false);
    });
    
    it('should handle wrap-around time window', () => {
      const schedule: CleanupSchedule = {
        frequency: 'daily',
        maxRunTimeMinutes: 60,
        timeWindow: { start: '22:00', end: '02:00' },
      };
      
      // 11 PM - should run
      const elevenPm = new Date('2024-01-15T23:00:00');
      expect(shouldRunCleanup(schedule, null, elevenPm)).toBe(true);
      
      // 1 AM - should run
      const oneAm = new Date('2024-01-15T01:00:00');
      expect(shouldRunCleanup(schedule, null, oneAm)).toBe(true);
      
      // 10 AM - should not run
      const tenAm = new Date('2024-01-15T10:00:00');
      expect(shouldRunCleanup(schedule, null, tenAm)).toBe(false);
    });
  });
  
  describe('getNextRunTime', () => {
    it('should return null for manual frequency', () => {
      const schedule: CleanupSchedule = {
        frequency: 'manual',
        maxRunTimeMinutes: 60,
      };
      
      expect(getNextRunTime(schedule, null)).toBeNull();
    });
    
    it('should return null for on-sync frequency', () => {
      const schedule: CleanupSchedule = {
        frequency: 'on-sync',
        maxRunTimeMinutes: 60,
      };
      
      expect(getNextRunTime(schedule, null)).toBeNull();
    });
    
    it('should calculate next daily run', () => {
      const schedule: CleanupSchedule = {
        frequency: 'daily',
        maxRunTimeMinutes: 60,
      };
      const now = new Date('2024-01-15T10:00:00');
      
      const next = getNextRunTime(schedule, null, now);
      expect(next).toEqual(new Date('2024-01-16T10:00:00'));
    });
    
    it('should calculate next run with time window', () => {
      const schedule: CleanupSchedule = {
        frequency: 'daily',
        maxRunTimeMinutes: 60,
        timeWindow: { start: '02:00', end: '04:00' },
      };
      const now = new Date('2024-01-15T10:00:00');
      
      const next = getNextRunTime(schedule, null, now);
      expect(next).toEqual(new Date('2024-01-16T02:00:00'));
    });
  });
  
  describe('parseSize', () => {
    it('should parse bytes', () => {
      expect(parseSize('100')).toBe(100);
      expect(parseSize('100B')).toBe(100);
      expect(parseSize('100b')).toBe(100);
    });
    
    it('should parse KB', () => {
      expect(parseSize('10KB')).toBe(10 * 1024);
      expect(parseSize('10kb')).toBe(10 * 1024);
      expect(parseSize('1.5KB')).toBe(Math.floor(1.5 * 1024));
    });
    
    it('should parse MB', () => {
      expect(parseSize('100MB')).toBe(100 * 1024 ** 2);
    });
    
    it('should parse GB', () => {
      expect(parseSize('10GB')).toBe(10 * 1024 ** 3);
    });
    
    it('should parse TB', () => {
      expect(parseSize('1TB')).toBe(1 * 1024 ** 4);
    });
    
    it('should handle whitespace', () => {
      expect(parseSize(' 10 GB ')).toBe(10 * 1024 ** 3);
    });
    
    it('should throw on invalid format', () => {
      expect(() => parseSize('invalid')).toThrow();
      expect(() => parseSize('10XB')).toThrow();
    });
  });
});
