import { BulkCommitScanner } from '../src/scanner';

describe('BulkCommitScanner', () => {
  let scanner: BulkCommitScanner;

  beforeEach(() => {
    scanner = new BulkCommitScanner();
  });

  describe('calculateBulkScore', () => {
    it('should score high for files with many changes and formatting messages', () => {
      const score = (scanner as any).calculateBulkScore(50, 100, 0.9, 'prettier format');
      expect(score).toBeGreaterThan(70);
    });

    it('should score medium for files with moderate changes', () => {
      const score = (scanner as any).calculateBulkScore(25, 50, 0.5, 'refactor');
      expect(score).toBeGreaterThan(40);
    });

    it('should score low for files with few changes', () => {
      const score = (scanner as any).calculateBulkScore(10, 20, 0.1, 'bug fix');
      expect(score).toBeLessThan(40);
    });

    it('should score high for whitespace-only commits', () => {
      const score = (scanner as any).calculateBulkScore(30, 10, 0.95, 'format');
      expect(score).toBeGreaterThan(60);
    });

    it('should detect style/indent keywords', () => {
      const score = (scanner as any).calculateBulkScore(25, 60, 0.3, 'fix trailing whitespace');
      expect(score).toBeGreaterThan(30);
    });

    it('should detect copyright/license updates', () => {
      const score = (scanner as any).calculateBulkScore(30, 100, 0.1, 'update copyright year');
      expect(score).toBeGreaterThan(40);
    });

    it('should cap score at 100', () => {
      // 50 (files>=50) + 20 (prettier) + 20 (whitespace>=0.8) = 90, capped at 100
      const score = (scanner as any).calculateBulkScore(100, 500, 0.95, 'prettier format all files');
      expect(score).toBeLessThanOrEqual(100);
      expect(score).toBe(90);
    });
  });
});
