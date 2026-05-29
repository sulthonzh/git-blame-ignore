export interface BulkCommit {
  sha: string;
  message: string;
  filesChanged: number;
  linesChanged: number;
  whitespaceRatio: number;
  bulkScore: number;
  date: string;
}

export interface IgnoreEntry {
  sha: string;
  message: string;
  date: string;
  comment?: string;
}

export interface GitBlameIgnoreConfig {
  ignoreFile: string;
  minFilesChanged: number;
  minBulkScore: number;
  whitespaceThreshold: number;
}

export interface ScanResult {
  bulkCommits: BulkCommit[];
  totalScanned: number;
}

export interface ValidateResult {
  valid: IgnoreEntry[];
  invalid: string[];
}
