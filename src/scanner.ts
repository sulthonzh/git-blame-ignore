import simpleGit, { SimpleGit } from 'simple-git';
import { BulkCommit } from './types';

export class BulkCommitScanner {
  private git: SimpleGit;
  private config: {
    minFilesChanged: number;
    minBulkScore: number;
    whitespaceThreshold: number;
  };

  constructor(config?: {
    minFilesChanged?: number;
    minBulkScore?: number;
    whitespaceThreshold?: number;
  }) {
    this.git = simpleGit();
    this.config = {
      minFilesChanged: config?.minFilesChanged || 20,
      minBulkScore: config?.minBulkScore || 40,
      whitespaceThreshold: config?.whitespaceThreshold || 0.8,
    };
  }

  async scan(): Promise<BulkCommit[]> {
    try {
      const log = await this.git.log({ 
        format: '%H|%s|%ai|%P',
        file: null,
        n: 100 
      });

      const commits: BulkCommit[] = [];

      for (const commit of log.all) {
        const [hash] = commit.split('|');
        const bulkCommit = await this.analyzeCommit(hash);
        if (bulkCommit.bulkScore >= this.config.minBulkScore) {
          commits.push(bulkCommit);
        }
      }

      return commits.sort((a, b) => b.bulkScore - a.bulkScore);
    } catch (error) {
      throw new Error(`Failed to scan commits: ${error}`);
    }
  }

  private async analyzeCommit(sha: string): Promise<BulkCommit> {
    const diff = await this.git.diff([`${sha}^`, sha, '--name-only']);
    const files = diff.split('\n').filter(f => f.trim() !== '');
    
    if (files.length < this.config.minFilesChanged) {
      return this.createEmptyCommit(sha, files.length);
    }

    const stats = await this.git.diff([`${sha}^`, sha, '--stat']);
    const linesChanged = this.parseLinesChanged(stats);
    
    const whitespaceRatio = await this.calculateWhitespaceRatio(sha);
    const message = await this.getCommitMessage(sha);
    
    const bulkScore = this.calculateBulkScore(files.length, linesChanged, whitespaceRatio, message);
    
    return {
      sha,
      message,
      filesChanged: files.length,
      linesChanged,
      whitespaceRatio,
      bulkScore,
      date: await this.getCommitDate(sha),
    };
  }

  private createEmptyCommit(sha: string, filesChanged: number): BulkCommit {
    return {
      sha,
      message: 'Unknown',
      filesChanged,
      linesChanged: 0,
      whitespaceRatio: 0,
      bulkScore: 0,
      date: 'Unknown',
    };
  }

  private parseLinesChanged(stats: string): number {
    const linesMatch = stats.match(/\d+ files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
    if (!linesMatch) return 0;
    
    const insertions = linesMatch[1] ? parseInt(linesMatch[1]) : 0;
    const deletions = linesMatch[2] ? parseInt(linesMatch[2]) : 0;
    return insertions + deletions;
  }

  private async calculateWhitespaceRatio(sha: string): Promise<number> {
    try {
      const diff = await this.git.diff([`${sha}^`, sha, '--']);
      if (!diff) return 0;

      const lines = diff.split('\n');
      const whitespaceLines = lines.filter(line => 
        line.trim() === '' && line !== 'diff --git' && !line.startsWith('index') && !line.startsWith('---') && !line.startsWith('+++')
      ).length;

      return lines.length > 0 ? whitespaceLines / lines.length : 0;
    } catch {
      return 0;
    }
  }

  private async getCommitMessage(sha: string): Promise<string> {
    try {
      const result = await this.git.show([sha, '--format=%s', '--no-patch']);
      return result.trim();
    } catch {
      return 'Unknown';
    }
  }

  private async getCommitDate(sha: string): Promise<string> {
    try {
      const result = await this.git.show([sha, '--format=%ai', '--no-patch']);
      return result.trim();
    } catch {
      return 'Unknown';
    }
  }

  private calculateBulkScore(
    filesChanged: number, 
    linesChanged: number, 
    whitespaceRatio: number, 
    message: string
  ): number {
    let score = 0;

    // Files changed scoring
    if (filesChanged >= 50) score += 50;
    else if (filesChanged >= 30) score += 40;
    else if (filesChanged >= 20) score += 30;

    // Message scoring
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('prettier') || lowerMessage.includes('format')) score += 20;
    if (lowerMessage.includes('eslint') || lowerMessage.includes('lint')) score += 20;
    if (lowerMessage.includes('rename') || lowerMessage.includes('refactor')) score += 20;

    // Whitespace scoring
    if (whitespaceRatio >= this.config.whitespaceThreshold) score += 20;

    // Lines per file scoring (if many changes but few lines per file, likely formatting)
    const linesPerFile = filesChanged > 0 ? linesChanged / filesChanged : 0;
    if (linesPerFile < 5) score += 10;

    return Math.min(score, 100);
  }
}