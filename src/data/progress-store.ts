import * as fs from 'fs';
import * as path from 'path';
import { ProgressData, ProgressEntry } from '@owenbush/decodie-core';

export class ProgressStore {
  private projectDir: string;
  private progressPath: string;
  private cachedProgress: ProgressData | null = null;

  constructor(projectDir: string) {
    this.projectDir = path.resolve(projectDir);
    this.progressPath = path.join(this.projectDir, '.decodie', 'progress.json');
  }

  /** Invalidate the cached progress so the next read goes to disk. */
  invalidateCache(): void {
    this.cachedProgress = null;
  }

  /** Read and parse .decodie/progress.json, returning defaults if missing. */
  loadProgress(): ProgressData {
    if (this.cachedProgress) {
      return this.cachedProgress;
    }

    if (!fs.existsSync(this.progressPath)) {
      const empty: ProgressData = { learned_entries: {} };
      this.cachedProgress = empty;
      return empty;
    }

    let raw: string;
    try {
      raw = fs.readFileSync(this.progressPath, 'utf-8');
    } catch {
      const empty: ProgressData = { learned_entries: {} };
      this.cachedProgress = empty;
      return empty;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const empty: ProgressData = { learned_entries: {} };
      this.cachedProgress = empty;
      return empty;
    }

    const progress = parsed as ProgressData;
    if (!progress.learned_entries) {
      progress.learned_entries = {};
    }

    this.cachedProgress = progress;
    return progress;
  }

  /** Mark an entry as learned and persist to disk. */
  markLearned(entryId: string): ProgressEntry {
    const progress = this.loadProgress();
    const entry: ProgressEntry = { learned_at: new Date().toISOString() };
    progress.learned_entries[entryId] = entry;
    this.writeProgress(progress);
    return entry;
  }

  /** Remove the learned mark from an entry and persist to disk. */
  unmarkLearned(entryId: string): void {
    const progress = this.loadProgress();
    delete progress.learned_entries[entryId];
    this.writeProgress(progress);
  }

  /** Check whether an entry is marked as learned. */
  isLearned(entryId: string): boolean {
    const progress = this.loadProgress();
    return entryId in progress.learned_entries;
  }

  private writeProgress(progress: ProgressData): void {
    const dir = path.dirname(this.progressPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(
      this.progressPath,
      JSON.stringify(progress, null, 2) + '\n',
      'utf-8'
    );
    this.cachedProgress = progress;
  }
}
