import chalk from 'chalk';
import inquirer from 'inquirer';
import { BulkCommitScanner } from './scanner';
import { GitBlameIgnoreFileManager } from './file-manager';


export class GitBlameIgnoreCLI {
  private scanner: BulkCommitScanner;
  private fileManager: GitBlameIgnoreFileManager;

  constructor() {
    this.scanner = new BulkCommitScanner();
    this.fileManager = new GitBlameIgnoreFileManager();
  }

  async init(): Promise<void> {
    console.log(chalk.blue('🔍 git-blame-ignore init - Interactive Setup Wizard'));
    console.log(chalk.gray('Scanning for bulk-change commits...\n'));

    try {
      const commits = await this.scanner.scan();
      
      if (commits.length === 0) {
        console.log(chalk.yellow('🤔 No bulk-change commits found that meet the criteria.'));
        console.log(chalk.gray('Try running formatting tools like prettier or eslint --fix first.'));
        return;
      }

      console.log(chalk.green(`✅ Found ${commits.length} bulk-change commits:\n`));

      // Display commits
      commits.forEach((commit, index) => {
        const scoreColor = commit.bulkScore >= 70 ? chalk.green : commit.bulkScore >= 50 ? chalk.yellow : chalk.red;
        console.log(`${index + 1}. ${commit.sha.substring(0, 7)} ${scoreColor(`[${commit.bulkScore}/100]`)} ${commit.message}`);
        console.log(`   📁 ${commit.filesChanged} files changed, 📝 ${commit.linesChanged} lines changed`);
        console.log(`   📅 ${commit.date}\n`);
      });

      // Ask user to select commits
      const answers = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'commits',
          message: 'Which commits would you like to add to .git-blame-ignore-revs?',
          choices: commits.map((commit) => ({
            name: `${commit.sha.substring(0, 7)} - ${commit.message} (${commit.filesChanged} files)`,
            value: commit.sha,
            short: commit.sha.substring(0, 7)
          })),
          pageSize: 10
        }
      ]);

      if (answers.commits.length === 0) {
        console.log(chalk.yellow('❌ No commits selected. Exiting.'));
        return;
      }

      // Add selected commits
      for (const sha of answers.commits) {
        await this.fileManager.add(sha);
      }

      console.log(chalk.green(`✅ Successfully added ${answers.commits.length} commits to .git-blame-ignore-revs`));
      console.log(chalk.blue('💡 Now run `git blame` on affected files to see the improved output!'));

    } catch (error) {
      console.error(chalk.red('❌ Error during initialization:'), error);
      process.exit(1);
    }
  }

  async scan(limit: number = 20): Promise<void> {
    console.log(chalk.blue('🔍 git-blame-ignore scan - Finding bulk-change commits'));
    console.log(chalk.gray(`Analyzing last 100 commits...\n`));

    try {
      const commits = await this.scanner.scan();

      if (commits.length === 0) {
        console.log(chalk.yellow('🤔 No bulk-change commits found that meet the criteria.'));
        console.log(chalk.gray('Try running formatting tools like prettier or eslint --fix first.'));
        return;
      }

      const displayCommits = commits.slice(0, limit);
      
      console.log(chalk.green(`📋 Found ${commits.length} bulk-change commits (showing first ${Math.min(limit, commits.length)}):\n`));

      displayCommits.forEach((commit, index) => {
        const scoreColor = commit.bulkScore >= 70 ? chalk.green : commit.bulkScore >= 50 ? chalk.yellow : chalk.red;
        console.log(`${index + 1}. ${commit.sha.substring(0, 7)} ${scoreColor(`[${commit.bulkScore}/100]`)} ${commit.message}`);
        console.log(`   📁 ${commit.filesChanged} files changed, 📝 ${commit.linesChanged} lines changed`);
        console.log(`   📅 ${commit.date} | Whitespace: ${Math.round(commit.whitespaceRatio * 100)}%\n`);
      });

      if (commits.length > limit) {
        console.log(chalk.gray(`... and ${commits.length - limit} more commits`));
      }

    } catch (error) {
      console.error(chalk.red('❌ Error during scan:'), error);
      process.exit(1);
    }
  }

  async add(sha: string): Promise<void> {
    console.log(chalk.blue(`📝 git-blame-ignore add ${sha}`));

    try {
      await this.fileManager.add(sha);
    } catch (error) {
      console.error(chalk.red('❌ Error adding commit:'), error);
      process.exit(1);
    }
  }

  async list(): Promise<void> {
    console.log(chalk.blue('📋 git-blame-ignore list - Current .git-blame-ignore-revs entries'));

    try {
      const entries = await this.fileManager.read();

      if (entries.length === 0) {
        console.log(chalk.yellow('🤔 No entries found in .git-blame-ignore-revs'));
        console.log(chalk.gray('Run `git-blame-ignore init` to add some commits.'));
        return;
      }

      console.log(chalk.green(`📋 .git-blame-ignore-revs (${entries.length} entries):\n`));

      entries.forEach((entry, index) => {
        console.log(`${index + 1}. ${entry.sha.substring(0, 7)} - ${entry.message}`);
        console.log(`   📅 ${entry.date}`);
        if (entry.comment) {
          console.log(`   💬 ${entry.comment}`);
        }
        console.log('');
      });

    } catch (error) {
      console.error(chalk.red('❌ Error listing entries:'), error);
      process.exit(1);
    }
  }

  async remove(sha: string): Promise<void> {
    console.log(chalk.blue(`🗑️  git-blame-ignore remove ${sha}`));

    try {
      await this.fileManager.remove(sha);
    } catch (error) {
      console.error(chalk.red('❌ Error removing commit:'), error);
      process.exit(1);
    }
  }

  async check(): Promise<void> {
    console.log(chalk.blue('✅ git-blame-ignore check - Validating entries'));

    try {
      const entries = await this.fileManager.read();
      
      if (entries.length === 0) {
        console.log(chalk.yellow('🤔 No entries to check.'));
        return;
      }

      const { valid, invalid } = await this.fileManager.validate(entries);

      console.log(chalk.green(`✅ Valid entries: ${valid.length}`));
      console.log(chalk.red(`❌ Invalid entries: ${invalid.length}\n`));

      if (invalid.length > 0) {
        console.log(chalk.red('Invalid entries (SHAs not found in repository):'));
        invalid.forEach(entry => {
          console.log(`  - ${entry.sha.substring(0, 7)} - ${entry.message}`);
        });
        console.log('');
      }

      if (valid.length > 0) {
        console.log(chalk.green('Valid entries:'));
        valid.forEach(entry => {
          console.log(`  ✅ ${entry.sha.substring(0, 7)} - ${entry.message}`);
        });
      }

      if (invalid.length > 0) {
        console.log(chalk.yellow('\n💡 Tip: Remove invalid entries with `git-blame-ignore remove <sha>`'));
      }

    } catch (error) {
      console.error(chalk.red('❌ Error during validation:'), error);
      process.exit(1);
    }
  }
}