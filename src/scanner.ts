import simpleGit, { SimpleGit } from 'simple-git';
import { BulkCommit } from './types';

export class BulkCommitScanner {
  private git: SimpleGit;
  private config: {
    minFilesChanged: number;
    minBulkScore: number;
    whitespaceThreshold: number;
  };

  constructor(baseDir?: string, config?: {
    minFilesChanged?: number;
    minBulkScore?: number;
    whitespaceThreshold?: number;
  }) {
    this.git = simpleGit(baseDir || process.cwd());
    this.config = {
      minFilesChanged: config?.minFilesChanged ?? 20,
      minBulkScore: config?.minBulkScore ?? 40,
      whitespaceThreshold: config?.whitespaceThreshold ?? 0.8,
    };
  }

  async scan(maxCommits: number = 100): Promise<BulkCommit[]> {
    const log = await this.git.log({ maxCount: maxCommits });
    const commits: BulkCommit[] = [];

    for (const commit of log.all) {
      const bulkCommit = await this.analyzeCommit(commit.hash);
      if (bulkCommit.bulkScore >= this.config.minBulkScore) {
        commits.push(bulkCommit);
      }
    }

    return commits.sort((a, b) => b.bulkScore - a.bulkScore);
  }

  private async analyzeCommit(sha: string): Promise<BulkCommit> {
    try {
      const diffSummary = await this.git.diffSummary([`${sha}^`, sha]);
      const filesChanged = diffSummary.files.length;

      if (filesChanged < this.config.minFilesChanged) {
        return this.createEmptyCommit(sha, filesChanged);
      }

      const linesChanged = diffSummary.insertions + diffSummary.deletions;
      const whitespaceRatio = await this.calculateWhitespaceRatio(sha);
      const message = await this.getCommitMessage(sha);
      const date = await this.getCommitDate(sha);

      const bulkScore = this.calculateBulkScore(filesChanged, linesChanged, whitespaceRatio, message);

      return {
        sha,
        message,
        filesChanged,
        linesChanged,
        whitespaceRatio,
        bulkScore,
        date,
      };
    } catch {
      return {
        sha,
        message: 'Unknown',
        filesChanged: 0,
        linesChanged: 0,
        whitespaceRatio: 0,
        bulkScore: 0,
        date: 'Unknown',
      };
    }
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

  private async calculateWhitespaceRatio(sha: string): Promise<number> {
    try {
      const diff = await this.git.diff([`${sha}^`, sha, '--']);
      if (!diff) return 0;

      const lines = diff.split('\n').filter(line => line.startsWith('+') || line.startsWith('-'));
      if (lines.length === 0) return 0;

      const whitespaceLines = lines.filter(line => {
        const content = line.substring(1);
        return content.trim() === '' || content.trim().length === 0;
      }).length;

      return whitespaceLines / lines.length;
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

    // Message scoring — detect common bulk-change patterns
    const lowerMessage = message.toLowerCase();
    const bulkKeywords = [
      { patterns: ['prettier', 'format', 'formatted'], weight: 20 },
      { patterns: ['eslint', 'lint', 'linting'], weight: 20 },
      { patterns: ['rename', 'refactor'], weight: 15 },
      { patterns: ['style', 'indent', 'whitespace', 'trailing'], weight: 15 },
      { patterns: ['update copyright', 'license', 'header update'], weight: 15 },
      { patterns: ['mass', 'bulk', 'batch'], weight: 10 },
    ];

    for (const { patterns, weight } of bulkKeywords) {
      if (patterns.some(p => lowerMessage.includes(p))) {
        score += weight;
        break; // Only count the best match
      }
    }

    // Whitespace scoring
    if (whitespaceRatio >= this.config.whitespaceThreshold) score += 20;
    else if (whitespaceRatio >= 0.5) score += 10;

    // Lines per file — low avg suggests formatting
    const linesPerFile = filesChanged > 0 ? linesChanged / filesChanged : 0;
    if (linesPerFile < 5 && filesChanged >= 20) score += 10;

    return Math.min(score, 100);
  }
}
