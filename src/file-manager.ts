import fs from 'fs/promises';
import path from 'path';
import { IgnoreEntry } from './types';

export class GitBlameIgnoreFileManager {
  private ignoreFilePath: string;

  constructor(ignoreFilePath?: string) {
    this.ignoreFilePath = ignoreFilePath || '.git-blame-ignore-revs';
  }

  async exists(): Promise<boolean> {
    try {
      await fs.access(this.ignoreFilePath);
      return true;
    } catch {
      return false;
    }
  }

  async read(): Promise<IgnoreEntry[]> {
    if (!(await this.exists())) {
      return [];
    }

    try {
      const content = await fs.readFile(this.ignoreFilePath, 'utf-8');
      const entries: IgnoreEntry[] = [];
      
      const lines = content.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
      
      for (const line of lines) {
        const sha = line.trim();
        if (sha && /^[a-f0-9]{40}$/i.test(sha)) {
          const entry = await this.createIgnoreEntry(sha);
          if (entry) {
            entries.push(entry);
          }
        }
      }

      return entries;
    } catch (error) {
      throw new Error(`Failed to read ${this.ignoreFilePath}: ${error}`);
    }
  }

  async add(sha: string, comment?: string): Promise<void> {
    const entry = await this.createIgnoreEntry(sha);
    if (!entry) {
      throw new Error(`Invalid commit SHA: ${sha}`);
    }

    const entries = await this.read();
    
    // Check if already exists
    if (entries.some(e => e.sha === sha)) {
      console.log(`Entry ${sha.substring(0, 7)} already exists in ${this.ignoreFilePath}`);
      return;
    }

    entries.push({
      ...entry,
      comment: comment || `Auto-added by git-blame-ignore`
    });

    await this.write(entries);
    console.log(`Added ${sha.substring(0, 7)} to ${this.ignoreFilePath}`);
  }

  async remove(sha: string): Promise<void> {
    const entries = await this.read();
    const filtered = entries.filter(e => e.sha !== sha);
    
    if (filtered.length === entries.length) {
      console.log(`Entry ${sha.substring(0, 7)} not found in ${this.ignoreFilePath}`);
      return;
    }

    await this.write(filtered);
    console.log(`Removed ${sha.substring(0, 7)} from ${this.ignoreFilePath}`);
  }

  async write(entries: IgnoreEntry[]): Promise<void> {
    try {
      // Create directory if it doesn't exist
      const dir = path.dirname(this.ignoreFilePath);
      await fs.mkdir(dir, { recursive: true });

      let content = '# .git-blame-ignore-revs - managed by git-blame-ignore\n';
      content += '# Format: SHA of commits to ignore for git blame\n\n';

      for (const entry of entries) {
        content += `# ${entry.sha.substring(0, 7)} - ${entry.message} (${entry.date})\n`;
        content += `${entry.sha}\n\n`;
      }

      await fs.writeFile(this.ignoreFilePath, content);
    } catch (error) {
      throw new Error(`Failed to write ${this.ignoreFilePath}: ${error}`);
    }
  }

  async validate(entries: IgnoreEntry[]): Promise<{ valid: IgnoreEntry[]; invalid: IgnoreEntry[] }> {
    const valid: IgnoreEntry[] = [];
    const invalid: IgnoreEntry[] = [];

    for (const entry of entries) {
      try {
        // Check if SHA is a valid 40-character hex string
        if (!/^[a-f0-9]{40}$/i.test(entry.sha)) {
          invalid.push(entry);
          continue;
        }

        // Try to get commit info to verify it exists
        const git = require('simple-git')();
        const result = await git.show([entry.sha, '--format=%H', '--no-patch']);
        
        if (result.trim() === entry.sha) {
          valid.push(entry);
        } else {
          invalid.push(entry);
        }
      } catch {
        invalid.push(entry);
      }
    }

    return { valid, invalid };
  }

  private async createIgnoreEntry(sha: string): Promise<IgnoreEntry | null> {
    try {
      const git = require('simple-git')();
      const [message, date] = await Promise.all([
        git.show([sha, '--format=%s', '--no-patch']),
        git.show([sha, '--format=%ai', '--no-patch'])
      ]);

      return {
        sha,
        message: message.trim(),
        date: date.trim(),
      };
    } catch {
      return null;
    }
  }
}