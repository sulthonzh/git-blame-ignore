import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

const TEST_REPO_DIR = path.join(__dirname, 'test-repo');
const GIT_BLAME_IGNORE_CMD = 'node dist/index.js';

describe('git-blame-ignore', () => {
  beforeEach(async () => {
    // Create a test git repository
    await fs.mkdir(TEST_REPO_DIR, { recursive: true });
    process.chdir(TEST_REPO_DIR);
    
    // Initialize git repo
    execSync('git init', { stdio: 'inherit' });
    execSync('git config user.name "Test User"', { stdio: 'inherit' });
    execSync('git config user.email "test@example.com"', { stdio: 'inherit' });
    
    // Create some files and commits
    await fs.writeFile('test1.txt', 'content1');
    execSync('git add test1.txt', { stdio: 'inherit' });
    execSync('git commit -m "Initial commit"', { stdio: 'inherit' });
    
    await fs.writeFile('test2.txt', 'content2');
    execSync('git add test2.txt', { stdio: 'inherit' });
    execSync('git commit -m "Add test2"', { stdio: 'inherit' });
  });

  afterEach(async () => {
    // Clean up test repository
    process.chdir(__dirname);
    await fs.rm(TEST_REPO_DIR, { recursive: true, force: true });
  });

  it('should show help when no command is provided', () => {
    const output = execSync(`node dist/index.js --help`, { encoding: 'utf-8' });
    expect(output).toContain('git-blame-ignore');
  });

  it('should scan for bulk-change commits', () => {
    // Create a commit with multiple files
    const files = ['file1.txt', 'file2.txt', 'file3.txt'];
    files.forEach(file => {
      execSync(`echo "content" > ${file}`, { stdio: 'inherit' });
    });
    execSync('git add .', { stdio: 'inherit' });
    execSync('git commit -m "Bulk commit with many files"', { stdio: 'inherit' });
    
    const output = execSync(`node dist/index.js scan`, { encoding: 'utf-8' });
    expect(output).toContain('Bulk-change commits detected');
  });

  it('should list ignored commits when file exists', async () => {
    // Create .git-blame-ignore-revs file
    await fs.writeFile('.git-blame-ignore-revs', 'abc123def456\nxyz789uvw456\n');
    
    const output = execSync(`node dist/index.js list`, { encoding: 'utf-8' });
    expect(output).toContain('abc123def456');
    expect(output).toContain('xyz789uvw456');
  });

  it('should handle missing .git-blame-ignore-revs file gracefully', () => {
    const output = execSync(`node dist/index.js list`, { encoding: 'utf-8' });
    expect(output).toContain('No commits are currently ignored');
  });
});