import { describe, test, expect, beforeAll, afterAll, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import request from 'supertest';
import { createApp } from '../src/server/index';

let tempDir: string;
let app: ReturnType<typeof createApp>['app'];
let progressStore: ReturnType<typeof createApp>['progressStore'];
let lessonService: ReturnType<typeof createApp>['lessonService'];

function copyDirSync(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function cleanupStateFiles() {
  const progressPath = path.join(tempDir, '.decodie', 'progress.json');
  const lessonsPath = path.join(tempDir, '.decodie', 'lessons.json');
  if (fs.existsSync(progressPath)) {
    fs.unlinkSync(progressPath);
  }
  if (fs.existsSync(lessonsPath)) {
    fs.unlinkSync(lessonsPath);
  }
  progressStore.invalidateCache();
  lessonService.invalidateCache();
}

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lessons-test-'));
  const fixtureDir = path.resolve(__dirname, './fixtures/decodie');
  const learningDir = path.join(tempDir, '.decodie');
  copyDirSync(fixtureDir, learningDir);

  const mockProjectSrc = path.resolve(__dirname, './fixtures/mock-project/src');
  copyDirSync(mockProjectSrc, path.join(tempDir, 'src'));

  const result = createApp(tempDir);
  app = result.app;
  progressStore = result.progressStore;
  lessonService = result.lessonService;
});

afterAll(() => {
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe('Auto-generated lessons', () => {
  afterEach(() => {
    cleanupStateFiles();
  });

  test('GET /api/lessons includes auto-generated lessons from entry topics', async () => {
    const res = await request(app).get('/api/lessons');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const autoLessons = res.body.filter(
      (l: { type: string }) => l.type === 'auto'
    );

    // Only topics with 2+ active entries appear as auto-lessons:
    // security (a1b2 + e5f6), architecture (c3d4 + e5f6)
    const autoIds = autoLessons.map((l: { id: string }) => l.id).sort();
    expect(autoIds).toEqual([
      'auto-architecture',
      'auto-security',
    ]);

    for (const lesson of autoLessons) {
      expect(lesson.type).toBe('auto');
      expect(lesson.entry_count).toBeGreaterThanOrEqual(2);
    }
  });

  test('auto lessons sort entries by experience level', async () => {
    // "security" topic has a1b2 (foundational) and e5f6 (advanced)
    const res = await request(app).get('/api/lessons/auto-security');

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(2);
    expect(res.body.entries[0].entry.id).toBe('entry-1711540000-a1b2');
    expect(res.body.entries[0].entry.experience_level).toBe('foundational');
    expect(res.body.entries[0].order).toBe(0);
    expect(res.body.entries[1].entry.id).toBe('entry-1711540600-e5f6');
    expect(res.body.entries[1].entry.experience_level).toBe('advanced');
    expect(res.body.entries[1].order).toBe(1);
  });

  test('entries with multiple topics appear in multiple auto lessons', async () => {
    // entry-a1b2 has topics [authentication, security, error-handling]
    // It should appear in all three auto lessons
    const authRes = await request(app).get('/api/lessons/auto-authentication');
    const secRes = await request(app).get('/api/lessons/auto-security');
    const errRes = await request(app).get('/api/lessons/auto-error-handling');

    const entryInAuth = authRes.body.entries.find(
      (e: { entry: { id: string } }) => e.entry.id === 'entry-1711540000-a1b2'
    );
    const entryInSec = secRes.body.entries.find(
      (e: { entry: { id: string } }) => e.entry.id === 'entry-1711540000-a1b2'
    );
    const entryInErr = errRes.body.entries.find(
      (e: { entry: { id: string } }) => e.entry.id === 'entry-1711540000-a1b2'
    );

    expect(entryInAuth).toBeDefined();
    expect(entryInSec).toBeDefined();
    expect(entryInErr).toBeDefined();
  });

  test('archived/superseded entries excluded from auto lessons', async () => {
    const res = await request(app).get('/api/lessons');

    // "react" topic only exists on archived entry g7h8, so no auto-react lesson
    const reactLesson = res.body.find(
      (l: { id: string }) => l.id === 'auto-react'
    );
    expect(reactLesson).toBeUndefined();

    // "hooks" and "migration" also only on archived entry
    const hooksLesson = res.body.find(
      (l: { id: string }) => l.id === 'auto-hooks'
    );
    expect(hooksLesson).toBeUndefined();

    // "database" topic only on superseded entry i9j0
    const dbLesson = res.body.find(
      (l: { id: string }) => l.id === 'auto-database'
    );
    expect(dbLesson).toBeUndefined();
  });

  test('GET /api/lessons/:id returns auto lesson detail with entries', async () => {
    const res = await request(app).get('/api/lessons/auto-security');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('auto-security');
    expect(res.body.title).toBe('Security');
    expect(res.body.type).toBe('auto');
    expect(res.body.entries).toHaveLength(2);
    expect(res.body.entries[0].entry.id).toBe('entry-1711540000-a1b2');
    expect(res.body.entries[1].entry.id).toBe('entry-1711540600-e5f6');
    expect(res.body.total_count).toBe(2);
    expect(res.body.learned_count).toBe(0);
  });

  test('PUT on auto lesson returns 400', async () => {
    const res = await request(app)
      .put('/api/lessons/auto-security')
      .send({ title: 'Hacked' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Cannot modify auto-generated lessons');
  });

  test('DELETE on auto lesson returns 400', async () => {
    const res = await request(app).delete('/api/lessons/auto-security');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Cannot delete auto-generated lessons');
  });
});

describe('Custom lessons', () => {
  afterEach(() => {
    cleanupStateFiles();
  });

  test('POST /api/lessons creates a custom lesson', async () => {
    const res = await request(app)
      .post('/api/lessons')
      .send({
        title: 'My Security Basics',
        description: 'A custom lesson on security',
        entries: [
          { entry_id: 'entry-1711540000-a1b2', order: 0, note: 'Start here' },
          { entry_id: 'entry-1711540300-c3d4', order: 1 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('My Security Basics');
    expect(res.body.description).toBe('A custom lesson on security');
    expect(res.body.id).toMatch(/^lesson-/);
    expect(res.body.entries).toHaveLength(2);
    expect(res.body.entries[0].entry_id).toBe('entry-1711540000-a1b2');
    expect(res.body.entries[0].note).toBe('Start here');
    expect(res.body.entries[1].note).toBeNull();
    expect(res.body.created_at).toBeDefined();
    expect(res.body.updated_at).toBeDefined();
  });

  test('GET /api/lessons/:id returns custom lesson with ordered entries and notes', async () => {
    // Create lesson first
    const created = await request(app)
      .post('/api/lessons')
      .send({
        title: 'Ordered Lesson',
        entries: [
          { entry_id: 'entry-1711540600-e5f6', order: 1, note: 'Second' },
          { entry_id: 'entry-1711540000-a1b2', order: 0, note: 'First' },
        ],
      });

    const id = created.body.id;
    const res = await request(app).get(`/api/lessons/${id}`);

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Ordered Lesson');
    expect(res.body.type).toBe('custom');
    expect(res.body.entries).toHaveLength(2);
    // Should be sorted by order
    expect(res.body.entries[0].order).toBe(0);
    expect(res.body.entries[0].note).toBe('First');
    expect(res.body.entries[0].entry.id).toBe('entry-1711540000-a1b2');
    expect(res.body.entries[1].order).toBe(1);
    expect(res.body.entries[1].note).toBe('Second');
    expect(res.body.entries[1].entry.id).toBe('entry-1711540600-e5f6');
  });

  test('PUT /api/lessons/:id updates title, entry order, and notes', async () => {
    // Create
    const created = await request(app)
      .post('/api/lessons')
      .send({
        title: 'Original Title',
        entries: [
          { entry_id: 'entry-1711540000-a1b2', order: 0 },
        ],
      });

    const id = created.body.id;

    // Update
    const res = await request(app)
      .put(`/api/lessons/${id}`)
      .send({
        title: 'Updated Title',
        entries: [
          { entry_id: 'entry-1711540300-c3d4', order: 0, note: 'Now first' },
          { entry_id: 'entry-1711540000-a1b2', order: 1 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Title');
    expect(res.body.entries).toHaveLength(2);

    // Verify via GET
    const detail = await request(app).get(`/api/lessons/${id}`);
    expect(detail.body.title).toBe('Updated Title');
    expect(detail.body.entries).toHaveLength(2);
    expect(detail.body.entries[0].entry.id).toBe('entry-1711540300-c3d4');
  });

  test('DELETE /api/lessons/:id removes custom lesson', async () => {
    // Create
    const created = await request(app)
      .post('/api/lessons')
      .send({ title: 'To Be Deleted' });

    const id = created.body.id;

    const res = await request(app).delete(`/api/lessons/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);

    // Verify it's gone
    const detail = await request(app).get(`/api/lessons/${id}`);
    expect(detail.status).toBe(404);
  });

  test('custom lesson with dangling entry ref flags it as missing', async () => {
    const created = await request(app)
      .post('/api/lessons')
      .send({
        title: 'Dangling Refs',
        entries: [
          { entry_id: 'entry-nonexistent-xxxx', order: 0 },
          { entry_id: 'entry-1711540000-a1b2', order: 1 },
        ],
      });

    const id = created.body.id;
    const res = await request(app).get(`/api/lessons/${id}`);

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(2);

    // The dangling entry should be flagged as missing
    const danglingEntry = res.body.entries.find(
      (e: { entry: { id: string } }) => e.entry.id === 'entry-nonexistent-xxxx'
    );
    expect(danglingEntry).toBeDefined();
    expect(danglingEntry.missing).toBe(true);
    expect(danglingEntry.entry.title).toBe('Entry not found');

    // The valid entry should not be missing
    const validEntry = res.body.entries.find(
      (e: { entry: { id: string } }) => e.entry.id === 'entry-1711540000-a1b2'
    );
    expect(validEntry).toBeDefined();
    expect(validEntry.missing).toBeUndefined();
  });
});

describe('Progress integration', () => {
  afterEach(() => {
    cleanupStateFiles();
  });

  test('lesson summary includes correct learned_count and total_count', async () => {
    // Mark an entry as learned
    await request(app).post('/api/progress/entry-1711540000-a1b2/learn');

    const res = await request(app).get('/api/lessons');
    expect(res.status).toBe(200);

    // auto-security has 2 entries (a1b2 + e5f6); a1b2 is learned
    const secLesson = res.body.find(
      (l: { id: string }) => l.id === 'auto-security'
    );
    expect(secLesson).toBeDefined();
    expect(secLesson.total_count).toBe(2);
    expect(secLesson.learned_count).toBe(1);

    // Single-entry topics are filtered out (min 2 entries per topic)
    const authLesson = res.body.find(
      (l: { id: string }) => l.id === 'auto-authentication'
    );
    expect(authLesson).toBeUndefined();
  });

  test('lesson detail entries include per-entry learned status', async () => {
    // Mark entry as learned
    await request(app).post('/api/progress/entry-1711540000-a1b2/learn');

    const res = await request(app).get('/api/lessons/auto-security');
    expect(res.status).toBe(200);

    const entry = res.body.entries.find(
      (e: { entry: { id: string } }) => e.entry.id === 'entry-1711540000-a1b2'
    );
    expect(entry).toBeDefined();
    expect(entry.learned).toBe(true);
  });
});
