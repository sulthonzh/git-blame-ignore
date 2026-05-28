#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import simpleGit from 'simple-git';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const program = new Command();

program
  .name('git-blame-ignore')
  .description('Auto-detects bulk-change commits and manages .git-blame-ignore-revs file')
  .version('1.0.0');

program
  .command('scan')
  .description('Scan repository for bulk-change commits')
  .option('-n, --number <number>', 'Number of commits to check (default: 50)', '50')
  .option('-t, --threshold <threshold>', 'Threshold for bulk changes (default: 10)', '10')
  .action(async (options) => {
    try {
      await scanBulkCommits(parseInt(options.number), parseInt(options.threshold));
    } catch (error) {
      console.error(chalk.red('Error:'), (error as Error).message);
      process.exit(1);
    }
  });

program
  .command('ignore')
  .description('Add bulk-change commits to .git-blame-ignore-revs')
  .option('-c, --commits <commits>', 'Comma-separated list of commit hashes to ignore')
  .option('-a, --auto', 'Auto-scan and add all detected bulk commits')
  .action(async (options) => {
    try {
      if (options.auto) {
        const bulkCommits = await scanBulkCommits(50, 10);
        if (bulkCommits.length > 0) {
          await addToIgnoreFile(bulkCommits.map(commit => commit.hash));
        }
      } else if (options.commits) {
        const commitHashes = options.commits.split(',').map((hash: string) => hash.trim());
        await addToIgnoreFile(commitHashes);
      } else {
        console.log(chalk.yellow('Please specify either --commits or --auto'));
      }
    } catch (error) {
      console.error(chalk.red('Error:'), (error as Error).message);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List commits currently ignored in .git-blame-ignore-revs')
  .action(async () => {
    try {
      await listIgnoredCommits();
    } catch (error) {
      console.error(chalk.red('Error:'), (error as Error).message);
      process.exit(1);
    }
  });

program
  .command('remove')
  .description('Remove commits from .git-blame-ignore-revs')
  .option('-c, --commits <commits>', 'Comma-separated list of commit hashes to remove')
  .option('-a, --all', 'Remove all ignored commits')
  .action(async (options) => {
    try {
      if (options.all) {
        await removeAllIgnoredCommits();
      } else if (options.commits) {
        const commitHashes = options.commits.split(',').map((hash: string) => hash.trim());
        await removeFromIgnoreFile(commitHashes);
      } else {
        console.log(chalk.yellow('Please specify either --commits or --all'));
      }
    } catch (error) {
      console.error(chalk.red('Error:'), (error as Error).message);
      process.exit(1);
    }
  });

async function scanBulkCommits(limit: number, threshold: number) {
  const git = simpleGit();
  
  // Check if we're in a git repository
  try {
    await git.revparse(['--is-inside-work-tree']);
  } catch (error) {
    throw new Error('Not a git repository');
  }

  console.log(chalk.blue(`Scanning last ${limit} commits for bulk changes...`));

  const logOutput = await git.log(['--pretty=format:%H %s %an %ad', `--max-count=${limit}`, '--date=short']);
  const commits = logOutput.all;

  const bulkCommits: Array<{ hash: string; subject: string; author: string; date: string; changes: number }> = [];

  for (const commit of commits) {
    try {
      // Get number of changed files in this commit
      const diffSummary = await git.diffSummary([`${commit.hash}^`, commit.hash]);
      const changesCount = diffSummary.files.length;

      if (changesCount >= threshold) {
        bulkCommits.push({
          hash: commit.hash,
          subject: commit.message.split('\n')[0],
          author: commit.author_name,
          date: commit.date,
          changes: changesCount
        });
      }
    } catch (error) {
      console.warn(chalk.yellow(`Warning: Could not analyze commit ${commit.hash}: ${(error as Error).message}`));
    }
  }

  if (bulkCommits.length === 0) {
    console.log(chalk.green('✅ No bulk-change commits found'));
    return [];
  }

  console.log(chalk.blue('\n🔍 Bulk-change commits detected:'));
  console.table(bulkCommits.map(commit => ({
    Hash: commit.hash.substring(0, 8),
    Subject: commit.subject,
    Author: commit.author,
    Date: commit.date,
    Changes: commit.changes
  })));

  return bulkCommits;
}

async function addToIgnoreFile(commitHashes: string[]) {
  const gitignorePath = join(process.cwd(), '.git-blame-ignore-revs');
  let existingContent = '';

  try {
    existingContent = await readFile(gitignorePath, 'utf-8');
  } catch (error) {
    // File doesn't exist, that's okay
  }

  const newCommits = commitHashes.filter(hash => !existingContent.includes(hash));
  
  if (newCommits.length === 0) {
    console.log(chalk.green('✅ All specified commits are already ignored'));
    return;
  }

  const updatedContent = existingContent + (existingContent ? '\n' : '') + newCommits.join('\n') + '\n';
  
  try {
    await writeFile(gitignorePath, updatedContent, 'utf-8');
    console.log(chalk.green(`✅ Added ${newCommits.length} commit(s) to .git-blame-ignore-revs`));
    console.log(chalk.blue('💡 Run `git blame --ignore-revs` to use the ignore file'));
  } catch (error) {
    throw new Error(`Failed to write .git-blame-ignore-revs: ${(error as Error).message}`);
  }
}

async function listIgnoredCommits() {
  const gitignorePath = join(process.cwd(), '.git-blame-ignore-revs');
  
  try {
    const content = await readFile(gitignorePath, 'utf-8');
    const commits = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));
    
    if (commits.length === 0) {
      console.log(chalk.yellow('No commits are currently ignored'));
      return;
    }

    console.log(chalk.blue('📝 Currently ignored commits:'));
    commits.forEach((commit, index) => {
      console.log(`${index + 1}. ${commit}`);
    });
  } catch (error) {
    throw new Error('.git-blame-ignore-revs file not found');
  }
}

async function removeFromIgnoreFile(commitHashes: string[]) {
  const gitignorePath = join(process.cwd(), '.git-blame-ignore-revs');
  
  try {
    const content = await readFile(gitignorePath, 'utf-8');
    const lines = content.split('\n');
    
    const filteredLines = lines.filter(line => {
      return !commitHashes.includes(line.trim());
    });
    
    const updatedContent = filteredLines.join('\n');
    
    if (updatedContent === content) {
      console.log(chalk.yellow('None of the specified commits are currently ignored'));
      return;
    }
    
    await writeFile(gitignorePath, updatedContent, 'utf-8');
    console.log(chalk.green(`✅ Removed ${commitHashes.length} commit(s) from .git-blame-ignore-revs`));
  } catch (error) {
    throw new Error('.git-blame-ignore-revs file not found');
  }
}

async function removeAllIgnoredCommits() {
  const gitignorePath = join(process.cwd(), '.git-blame-ignore-revs');
  
  try {
    const content = await readFile(gitignorePath, 'utf-8');
    const commits = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));
    
    if (commits.length === 0) {
      console.log(chalk.yellow('No commits are currently ignored'));
      return;
    }
    
    // Create a backup
    const backupPath = gitignorePath + '.backup';
    await writeFile(backupPath, content, 'utf-8');
    
    // Clear the file but keep the structure
    await writeFile(gitignorePath, '# Git blame ignore file - auto-generated by git-blame-ignore\n', 'utf-8');
    
    console.log(chalk.green(`✅ Removed all ${commits.length} ignored commits`));
    console.log(chalk.blue(`💡 Backup saved to: ${backupPath}`));
  } catch (error) {
    throw new Error('.git-blame-ignore-revs file not found');
  }
}

program.parse();