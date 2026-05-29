#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import simpleGit from 'simple-git';
import { BulkCommitScanner } from './scanner';
import { GitBlameIgnoreFileManager } from './file-manager';

const program = new Command();

program
  .name('git-blame-ignore')
  .description('Auto-detects bulk-change commits and manages .git-blame-ignore-revs file')
  .version('1.1.0');

program
  .command('scan')
  .description('Scan repository for bulk-change commits')
  .option('-n, --number <count>', 'Number of commits to scan', '100')
  .option('-s, --min-score <score>', 'Minimum bulk score to report (0-100)', '40')
  .option('-f, --min-files <count>', 'Minimum files changed to consider', '20')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const git = simpleGit();
      await git.revparse(['--is-inside-work-tree']);

      const scanner = new BulkCommitScanner(process.cwd(), {
        minFilesChanged: parseInt(options.minFiles),
        minBulkScore: parseInt(options.minScore),
      });

      const results = await scanner.scan(parseInt(options.number));

      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      if (results.length === 0) {
        console.log(chalk.green('✅ No bulk-change commits found'));
        return;
      }

      console.log(chalk.blue(`\n🔍 Found ${results.length} bulk-change commit(s):\n`));

      for (const commit of results) {
        console.log(chalk.white(`  ${commit.sha.substring(0, 7)}`) + chalk.gray(` [${commit.bulkScore}/100]`) + ` ${commit.message}`);
        console.log(chalk.gray(`     📁 ${commit.filesChanged} files, 📝 ${commit.linesChanged} lines, ⬜ ${Math.round(commit.whitespaceRatio * 100)}% whitespace`));
        console.log(chalk.gray(`     📅 ${commit.date}`));
        console.log();
      }

      console.log(chalk.blue(`Tip: Run ${chalk.cyan('git-blame-ignore ignore --auto')} to add them all, or ${chalk.cyan('git-blame-ignore ignore --commits <sha>')} for specific ones`));
    } catch (error) {
      console.error(chalk.red('Error:'), (error as Error).message);
      process.exit(1);
    }
  });

program
  .command('ignore')
  .description('Add bulk-change commits to .git-blame-ignore-revs')
  .option('-c, --commits <shas>', 'Comma-separated list of commit hashes to ignore')
  .option('-a, --auto', 'Auto-scan and add all detected bulk commits')
  .option('-m, --message <msg>', 'Comment to add alongside the entries')
  .action(async (options) => {
    try {
      const manager = new GitBlameIgnoreFileManager();

      if (options.auto) {
        const scanner = new BulkCommitScanner(process.cwd());
        const results = await scanner.scan();

        if (results.length === 0) {
          console.log(chalk.yellow('No bulk-change commits detected. Nothing to add.'));
          return;
        }

        console.log(chalk.blue(`Adding ${results.length} bulk-change commit(s)...`));
        for (const commit of results) {
          await manager.add(commit.sha, options.message);
        }
        console.log(chalk.green(`\n✅ Added ${results.length} commits to .git-blame-ignore-revs`));
      } else if (options.commits) {
        const shas = options.commits.split(',').map((s: string) => s.trim()).filter(Boolean);
        for (const sha of shas) {
          await manager.add(sha, options.message);
        }
      } else {
        console.log(chalk.yellow('Specify --commits <shas> or --auto'));
      }

      console.log(chalk.blue('\n💡 Configure git to use it:'));
      console.log(chalk.gray('   git config blame.ignoreRevsFile .git-blame-ignore-revs'));
    } catch (error) {
      console.error(chalk.red('Error:'), (error as Error).message);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List commits currently ignored in .git-blame-ignore-revs')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const manager = new GitBlameIgnoreFileManager();

      if (options.json) {
        const entries = await manager.read();
        console.log(JSON.stringify(entries, null, 2));
        return;
      }

      const entries = await manager.read();

      if (entries.length === 0) {
        console.log(chalk.yellow('No commits are currently ignored'));
        return;
      }

      console.log(chalk.blue(`\n📝 ${entries.length} ignored commit(s):\n`));

      for (const [i, entry] of entries.entries()) {
        console.log(chalk.white(`  ${i + 1}. ${entry.sha.substring(0, 7)}`) + ` ${entry.message}`);
        console.log(chalk.gray(`     ${entry.date}${entry.comment ? ` — ${entry.comment}` : ''}`));
      }

      console.log();
    } catch (error) {
      console.error(chalk.red('Error:'), (error as Error).message);
      process.exit(1);
    }
  });

program
  .command('remove')
  .description('Remove commits from .git-blame-ignore-revs')
  .option('-c, --commits <shas>', 'Comma-separated list of commit hashes to remove')
  .option('-a, --all', 'Remove all ignored commits')
  .action(async (options) => {
    try {
      const manager = new GitBlameIgnoreFileManager();

      if (options.all) {
        const count = await manager.removeAll();
        console.log(chalk.green(`✅ Removed all ${count} ignored commits`));
        console.log(chalk.blue('💡 Backup saved to .git-blame-ignore-revs.backup'));
      } else if (options.commits) {
        const shas = options.commits.split(',').map((s: string) => s.trim()).filter(Boolean);
        for (const sha of shas) {
          await manager.remove(sha);
        }
      } else {
        console.log(chalk.yellow('Specify --commits <shas> or --all'));
      }
    } catch (error) {
      console.error(chalk.red('Error:'), (error as Error).message);
      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Validate entries in .git-blame-ignore-revs')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const manager = new GitBlameIgnoreFileManager();
      const { valid, invalid } = await manager.validate();

      if (options.json) {
        console.log(JSON.stringify({ valid, invalid }, null, 2));
        return;
      }

      if (valid.length === 0 && invalid.length === 0) {
        console.log(chalk.yellow('No entries to validate'));
        return;
      }

      console.log(chalk.green(`✅ ${valid.length} valid entries`));
      if (invalid.length > 0) {
        console.log(chalk.red(`❌ ${invalid.length} invalid entries:`));
        for (const sha of invalid) {
          console.log(chalk.red(`   ${sha}`));
        }
      }
    } catch (error) {
      console.error(chalk.red('Error:'), (error as Error).message);
      process.exit(1);
    }
  });

program.parse();
