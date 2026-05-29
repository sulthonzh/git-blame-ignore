import fs from 'fs/promises';
import path from 'path';
import simpleGit from 'simple-git';
import { IgnoreEntry } from './types';

export class GitBlameIgnoreFileManager {
  private ignoreFilePath: string;
  private baseDir: string;

  constructor(ignoreFilePath?: string, baseDir?: string) {
    this.baseDir = baseDir || process.cwd();
    this.ignoreFilePath = ignoreFilePath || '.git-blame-ignore-revs';
  }

  get fullPath(): string {
    return path.isAbsolute(this.ignoreFilePath)
      ? this.ignoreFilePath
      : path.join(this.baseDir, this.ignoreFilePath);
  }

  async exists(): Promise<boolean> {
    try {
      await fs.access(this.fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async read(): Promise<IgnoreEntry[]> {
    if (!(await this.exists())) {
      return [];
    }

    const content = await fs.readFile(this.fullPath, 'utf-8');
    const entries: IgnoreEntry[] = [];

    const lines = content.split('\n');
    let lastComment: string | undefined;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('#') && trimmed.length > 1) {
        // Track comments that describe entries
        lastComment = trimmed.substring(1).trim();
        continue;
      }

      if (trimmed && /^[a-f0-9]{7,40}$/i.test(trimmed)) {
        const entry = await this.createIgnoreEntry(trimmed);
        if (entry) {
          entries.push(lastComment ? { ...entry, comment: lastComment } : entry);
          lastComment = undefined;
        }
      }
    }

    return entries;
  }

  async readRaw(): Promise<string[]> {
    if (!(await this.exists())) {
      return [];
    }

    const content = await fs.readFile(this.fullPath, 'utf-8');
    return content.split('\n').filter(line => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith('#');
    });
  }

  async add(sha: string, comment?: string): Promise<void> {
    // Resolve short SHA to full SHA
    const fullSha = await this.resolveSha(sha);
    if (!fullSha) {
      throw new Error(`Invalid or unknown commit SHA: ${sha}`);
    }

    const existing = await this.readRaw();
    if (existing.some(e => e === fullSha || fullSha.startsWith(e) || e.startsWith(fullSha))) {
      console.log(`Entry ${sha.substring(0, 7)} already exists in ${this.ignoreFilePath}`);
      return;
    }

    const message = await this.getCommitMessage(fullSha);
    const date = await this.getCommitDate(fullSha);
    const entryComment = comment || `Auto-added by git-blame-ignore`;

    const header = '# .git-blame-ignore-revs - managed by git-blame-ignore\n# Format: SHA of commits to ignore for git blame\n\n';
    const entryBlock = `# ${fullSha.substring(0, 7)} - ${message} (${date}) - ${entryComment}\n${fullSha}\n`;

    let content: string;
    if (await this.exists()) {
      content = await fs.readFile(this.fullPath, 'utf-8');
      // Remove old header if it's the only content
      if (content.trim() === header.trim()) {
        content = header + entryBlock;
      } else {
        content = content.trimEnd() + '\n\n' + entryBlock;
      }
    } else {
      content = header + entryBlock;
    }

    await fs.mkdir(path.dirname(this.fullPath), { recursive: true });
    await fs.writeFile(this.fullPath, content);
    console.log(`Added ${fullSha.substring(0, 7)} (${message}) to ${this.ignoreFilePath}`);
  }

  async remove(sha: string): Promise<void> {
    if (!(await this.exists())) {
      throw new Error(`${this.ignoreFilePath} not found`);
    }

    const content = await fs.readFile(this.fullPath, 'utf-8');
    const lines = content.split('\n');
    const shaTrimmed = sha.trim();
    let removed = false;

    const filtered = lines.filter(line => {
      const trimmed = line.trim();
      if (trimmed === shaTrimmed || (trimmed.match(/^[a-f0-9]+$/i) && (trimmed.startsWith(shaTrimmed) || shaTrimmed.startsWith(trimmed)))) {
        removed = true;
        return false;
      }
      return true;
    });

    if (!removed) {
      console.log(`Entry ${sha.substring(0, 7)} not found in ${this.ignoreFilePath}`);
      return;
    }

    await fs.writeFile(this.fullPath, filtered.join('\n'));
    console.log(`Removed ${sha.substring(0, 7)} from ${this.ignoreFilePath}`);
  }

  async removeAll(): Promise<number> {
    if (!(await this.exists())) {
      throw new Error(`${this.ignoreFilePath} not found`);
    }

    const content = await fs.readFile(this.fullPath, 'utf-8');
    const commits = content.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));

    // Backup
    const backupPath = this.fullPath + '.backup';
    await fs.writeFile(backupPath, content);

    await fs.writeFile(
      this.fullPath,
      '# .git-blame-ignore-revs - managed by git-blame-ignore\n# (cleared)\n'
    );

    return commits.length;
  }

  async validate(): Promise<{ valid: IgnoreEntry[]; invalid: string[] }> {
    const raw = await this.readRaw();
    const valid: IgnoreEntry[] = [];
    const invalid: string[] = [];

    for (const sha of raw) {
      const entry = await this.createIgnoreEntry(sha);
      if (entry) {
        valid.push(entry);
      } else {
        invalid.push(sha);
      }
    }

    return { valid, invalid };
  }

  private async resolveSha(sha: string): Promise<string | null> {
    try {
      const git = simpleGit(this.baseDir);
      const result = await git.show([sha.trim(), '--format=%H', '--no-patch']);
      const full = result.trim().split('\n')[0];
      return /^[a-f0-9]{40}$/i.test(full) ? full : null;
    } catch {
      return null;
    }
  }

  private async createIgnoreEntry(sha: string): Promise<IgnoreEntry | null> {
    try {
      const fullSha = await this.resolveSha(sha);
      if (!fullSha) return null;

      const [message, date] = await Promise.all([
        this.getCommitMessage(fullSha),
        this.getCommitDate(fullSha),
      ]);

      return { sha: fullSha, message, date };
    } catch {
      return null;
    }
  }

  private async getCommitMessage(sha: string): Promise<string> {
    try {
      const git = simpleGit(this.baseDir);
      const result = await git.show([sha, '--format=%s', '--no-patch']);
      return result.trim();
    } catch {
      return 'Unknown';
    }
  }

  private async getCommitDate(sha: string): Promise<string> {
    try {
      const git = simpleGit(this.baseDir);
      const result = await git.show([sha, '--format=%ai', '--no-patch']);
      return result.trim();
    } catch {
      return 'Unknown';
    }
  }
}
