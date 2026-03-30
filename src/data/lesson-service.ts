import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { DataParser } from './parser';
import { ProgressStore } from './progress-store';
import {
  CustomLesson,
  LessonsFile,
  LessonSummary,
  LessonDetail,
  LessonDetailEntry,
  LessonEntry,
  IndexEntry,
} from './types';

const LEVEL_ORDER: Record<string, number> = {
  foundational: 0,
  intermediate: 1,
  advanced: 2,
  ecosystem: 3,
};

function randomHex(n: number): string {
  return crypto.randomBytes(n).toString('hex').slice(0, n * 2);
}

function formatTopicTitle(topic: string): string {
  return topic
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export class LessonService {
  private dataParser: DataParser;
  private progressStore: ProgressStore;
  private lessonsPath: string;
  private cachedLessons: LessonsFile | null = null;

  constructor(
    dataParser: DataParser,
    progressStore: ProgressStore,
    projectDir: string
  ) {
    this.dataParser = dataParser;
    this.progressStore = progressStore;
    this.lessonsPath = path.join(projectDir, '.decodie', 'lessons.json');
  }

  /** Invalidate the cached lessons so the next read goes to disk. */
  invalidateCache(): void {
    this.cachedLessons = null;
  }

  /** Read and parse .decodie/lessons.json, returning empty if missing. */
  loadCustomLessons(): LessonsFile {
    if (this.cachedLessons) {
      return this.cachedLessons;
    }

    if (!fs.existsSync(this.lessonsPath)) {
      const empty: LessonsFile = { lessons: [] };
      this.cachedLessons = empty;
      return empty;
    }

    let raw: string;
    try {
      raw = fs.readFileSync(this.lessonsPath, 'utf-8');
    } catch {
      const empty: LessonsFile = { lessons: [] };
      this.cachedLessons = empty;
      return empty;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const empty: LessonsFile = { lessons: [] };
      this.cachedLessons = empty;
      return empty;
    }

    const file = parsed as LessonsFile;
    if (!Array.isArray(file.lessons)) {
      file.lessons = [];
    }

    this.cachedLessons = file;
    return file;
  }

  /** Get auto-generated lessons grouped by topic. */
  getAutoLessons(): LessonSummary[] {
    const index = this.dataParser.loadIndex();
    const activeEntries = index.entries.filter((e) => e.lifecycle === 'active');

    // Group entries by topic
    const topicMap = new Map<string, IndexEntry[]>();
    for (const entry of activeEntries) {
      for (const topic of entry.topics) {
        let list = topicMap.get(topic);
        if (!list) {
          list = [];
          topicMap.set(topic, list);
        }
        list.push(entry);
      }
    }

    const summaries: LessonSummary[] = [];
    for (const [topic, entries] of topicMap) {
      const learnedCount = entries.filter((e) =>
        this.progressStore.isLearned(e.id)
      ).length;

      summaries.push({
        id: `auto-${topic}`,
        title: formatTopicTitle(topic),
        type: 'auto',
        topic,
        entry_count: entries.length,
        learned_count: learnedCount,
        total_count: entries.length,
      });
    }

    return summaries;
  }

  /** Get summaries for custom lessons. */
  getCustomLessonSummaries(): LessonSummary[] {
    const file = this.loadCustomLessons();
    const index = this.dataParser.loadIndex();
    const entryIds = new Set(index.entries.map((e) => e.id));

    return file.lessons.map((lesson) => {
      const validEntries = lesson.entries.filter((le) =>
        entryIds.has(le.entry_id)
      );
      const learnedCount = validEntries.filter((le) =>
        this.progressStore.isLearned(le.entry_id)
      ).length;

      return {
        id: lesson.id,
        title: lesson.title,
        type: 'custom' as const,
        entry_count: lesson.entries.length,
        learned_count: learnedCount,
        total_count: lesson.entries.length,
      };
    });
  }

  /** Get all lessons: auto first, then custom. */
  getAllLessons(): LessonSummary[] {
    return [...this.getAutoLessons(), ...this.getCustomLessonSummaries()];
  }

  /** Get full detail for a lesson by ID. */
  getLessonDetail(id: string): LessonDetail {
    if (id.startsWith('auto-')) {
      return this.getAutoLessonDetail(id);
    }
    return this.getCustomLessonDetail(id);
  }

  private getAutoLessonDetail(id: string): LessonDetail {
    const topic = id.slice('auto-'.length);
    const index = this.dataParser.loadIndex();
    const activeEntries = index.entries.filter(
      (e) => e.lifecycle === 'active' && e.topics.includes(topic)
    );

    // Sort by experience level
    activeEntries.sort(
      (a, b) =>
        (LEVEL_ORDER[a.experience_level] ?? 99) -
        (LEVEL_ORDER[b.experience_level] ?? 99)
    );

    const detailEntries: LessonDetailEntry[] = activeEntries.map(
      (entry, idx) => ({
        entry,
        order: idx,
        note: null,
        learned: this.progressStore.isLearned(entry.id),
      })
    );

    const learnedCount = detailEntries.filter((e) => e.learned).length;

    return {
      id,
      title: formatTopicTitle(topic),
      type: 'auto',
      description: null,
      entries: detailEntries,
      learned_count: learnedCount,
      total_count: detailEntries.length,
    };
  }

  private getCustomLessonDetail(id: string): LessonDetail {
    const file = this.loadCustomLessons();
    const lesson = file.lessons.find((l) => l.id === id);

    if (!lesson) {
      throw new Error(`Lesson not found: ${id}`);
    }

    const index = this.dataParser.loadIndex();
    const entryMap = new Map(index.entries.map((e) => [e.id, e]));

    const detailEntries: LessonDetailEntry[] = lesson.entries.map((le) => {
      const indexEntry = entryMap.get(le.entry_id);

      if (!indexEntry) {
        // Dangling reference — create placeholder
        const placeholder: IndexEntry = {
          id: le.entry_id,
          title: 'Entry not found',
          experience_level: 'foundational',
          topics: [],
          decision_type: 'explanation',
          session_id: '',
          timestamp: '',
          lifecycle: 'archived',
          references: [],
          external_docs: [],
          cross_references: [],
          content_file: '',
          superseded_by: null,
        };

        return {
          entry: placeholder,
          order: le.order,
          note: le.note,
          learned: false,
          missing: true,
        };
      }

      return {
        entry: indexEntry,
        order: le.order,
        note: le.note,
        learned: this.progressStore.isLearned(le.entry_id),
      };
    });

    // Sort by order
    detailEntries.sort((a, b) => a.order - b.order);

    const learnedCount = detailEntries.filter(
      (e) => e.learned && !e.missing
    ).length;

    return {
      id: lesson.id,
      title: lesson.title,
      type: 'custom',
      description: lesson.description,
      entries: detailEntries,
      learned_count: learnedCount,
      total_count: detailEntries.length,
    };
  }

  /** Create a new custom lesson. */
  createCustomLesson(data: {
    title: string;
    description?: string;
    entries?: Array<{ entry_id: string; order: number; note?: string }>;
  }): CustomLesson {
    const file = this.loadCustomLessons();
    const now = new Date().toISOString();

    const lesson: CustomLesson = {
      id: `lesson-${Date.now()}-${randomHex(4)}`,
      title: data.title,
      description: data.description ?? null,
      entries: (data.entries ?? []).map((e) => ({
        entry_id: e.entry_id,
        order: e.order,
        note: e.note ?? null,
      })),
      created_at: now,
      updated_at: now,
    };

    file.lessons.push(lesson);
    this.writeLessonsFile(file);
    return lesson;
  }

  /** Update an existing custom lesson. */
  updateCustomLesson(
    id: string,
    data: {
      title?: string;
      description?: string;
      entries?: Array<{
        entry_id: string;
        order: number;
        note?: string | null;
      }>;
    }
  ): CustomLesson {
    const file = this.loadCustomLessons();
    const lesson = file.lessons.find((l) => l.id === id);

    if (!lesson) {
      throw new Error(`Lesson not found: ${id}`);
    }

    if (data.title !== undefined) {
      lesson.title = data.title;
    }
    if (data.description !== undefined) {
      lesson.description = data.description;
    }
    if (data.entries !== undefined) {
      lesson.entries = data.entries.map((e) => ({
        entry_id: e.entry_id,
        order: e.order,
        note: e.note ?? null,
      }));
    }

    lesson.updated_at = new Date().toISOString();
    this.writeLessonsFile(file);
    return lesson;
  }

  /** Delete a custom lesson by ID. */
  deleteCustomLesson(id: string): void {
    const file = this.loadCustomLessons();
    const idx = file.lessons.findIndex((l) => l.id === id);

    if (idx === -1) {
      throw new Error(`Lesson not found: ${id}`);
    }

    file.lessons.splice(idx, 1);
    this.writeLessonsFile(file);
  }

  private writeLessonsFile(file: LessonsFile): void {
    const dir = path.dirname(this.lessonsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(
      this.lessonsPath,
      JSON.stringify(file, null, 2) + '\n',
      'utf-8'
    );
    this.cachedLessons = file;
  }
}
