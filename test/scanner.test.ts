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
  });

  describe('parseLinesChanged', () => {
    it('should parse lines changed from git stat output', () => {
      const stats = ' 3 files changed, 15 insertions(+), 10 deletions(-)';
      const lines = (scanner as any).parseLinesChanged(stats);
      expect(lines).toBe(25);
    });

    it('should handle output without insertions/deletions', () => {
      const stats = ' 2 files changed';
      const lines = (scanner as any).parseLinesChanged(stats);
      expect(lines).toBe(0);
    });

    it('should handle output with only insertions', () => {
      const stats = ' 1 file changed, 5 insertions(+)';
      const lines = (scanner as any).parseLinesChanged(stats);
      expect(lines).toBe(5);
    });

    it('should handle output with only deletions', () => {
      const stats = ' 1 file changed, 3 deletions(-)';
      const lines = (scanner as any).parseLinesChanged(stats);
      expect(lines).toBe(3);
    });
  });
});