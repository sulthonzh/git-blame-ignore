# git-blame-ignore

CLI that auto-detects bulk-change commits (prettier, lint autofix, mass renames) and manages your `.git-blame-ignore-revs` file — so `git blame` stays useful.

## 🎯 Problem

After running prettier, eslint --fix, or mass renames, `git blame` becomes useless for affected files — every line shows the formatting commit instead of who actually wrote the code. Git has `.git-blame-ignore-revs` natively, but:

- **Manual SHA hunting** — you have to find the commit SHA yourself
- **No auto-detection** — nobody wants to scan git log for bulk commits
- **File management is tedious** — add/remove/list entries manually

## ✨ Features

- **Auto-detection** - Scans git history for bulk-change commits using smart heuristics
- **Interactive management** - Easy `init` wizard to scan and select commits
- **Command-line interface** - Simple commands for all operations
- **GitHub compatible** - Works with GitHub's native `.git-blame-ignore-revs` support
- **Validation** - Checks that all SHAs are valid commits

## 🚀 Installation

```bash
npm install -g git-blame-ignore
```

## 📖 Usage

### Interactive Setup

```bash
git-blame-ignore init
```

Scans for bulk-change commits and lets you select which ones to ignore interactively.

### Commands

#### Scan for bulk commits (dry run)
```bash
git-blame-ignore scan
# Output:
# 🔍 Found 3 bulk-change commits:
#   1. a1b2c3d [85/100] Run prettier on all files
#      📁 47 files changed, 📝 2,841 lines changed
#      📅 2026-05-20 | Whitespace: 92%
```

#### Add a specific commit
```bash
git-blame-ignore add a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u
```

#### List current entries
```bash
git-blame-ignore list
# Output:
# 📋 .git-blame-ignore-revs (3 entries):
#   1. a1b2c3d - Run prettier on all files
#      📅 2026-05-20
```

#### Remove an entry
```bash
git-blame-ignore remove a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u
```

#### Validate entries
```bash
git-blame-ignore check
# Output:
# ✅ Valid entries: 3
# ❌ Invalid entries: 0
```

## 🔧 How It Works

### Detection Algorithm

The tool uses a scoring system to identify bulk-change commits:

- **Files changed**: 20+ files = +30 points, 50+ files = +50 points
- **Message matching**: "prettier", "format", "lint", "rename" = +20 points each
- **Whitespace ratio**: >80% whitespace changes = +20 points
- **Lines per file**: <5 lines per file = +10 points (indicates formatting)

Commits with a score ≥ 40 are suggested for ignoring.

### File Format

Creates and manages `.git-blame-ignore-revs` in the standard format:

```
# a1b2c3d4 Run prettier on all files (auto-detected by git-blame-ignore)
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u

# e4f5g6h7 eslint --fix (auto-detected by git-blame-ignore)
e4f5g6h7i8j9k0l1m2n3o4p5q6r7s8t9u0v1w2x3
```

## 🏗️ Development

```bash
# Clone and install
git clone https://github.com/sulthonzh/git-blame-ignore.git
cd git-blame-ignore
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Lint code
npm run lint
```

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🔗 Related

- [Git blame documentation](https://git-scm.com/docs/git-blame)
- [GitHub blame ignore documentation](https://docs.github.com/en/repositories/working-with-files/using-files/viewing-a-file#ignoring-commits-in-git-blame)
- [git-blame-ignore-revs file format](https://git-scm.com/docs/git-blame#Documentation/git-blame.txt---ignore-revs-fileltfilegt)