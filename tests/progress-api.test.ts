import { describe, test, expect, beforeAll, afterAll, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import request from 'supertest';
import { createApp } from '../src/server/index';

let tempDir: string;
let app: ReturnType<typeof createApp>['app'];
let progressStore: ReturnType<typeof createApp>['progressStore'];

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

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'progress-test-'));
  const fixtureDir = path.resolve(__dirname, './fixtures/decodie');
  const learningDir = path.join(tempDir, '.decodie');
  copyDirSync(fixtureDir, learningDir);

  const mockProjectSrc = path.resolve(__dirname, './fixtures/mock-project/src');
  copyDirSync(mockProjectSrc, path.join(tempDir, 'src'));

  const result = createApp(tempDir);
  app = result.app;
  progressStore = result.progressStore;
});

afterAll(() => {
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

afterEach(() => {
  // Clean up progress.json between tests to avoid pollution
  const progressPath = path.join(tempDir, '.decodie', 'progress.json');
  if (fs.existsSync(progressPath)) {
    fs.unlinkSync(progressPath);
  }
  progressStore.invalidateCache();
});

describe('Progress API', () => {
  test('GET /api/progress returns empty progress initially', async () => {
    const res = await request(app).get('/api/progress');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ learned_entries: {} });
  });

  test('POST /api/progress/:entryId/learn marks entry as learned', async () => {
    const res = await request(app)
      .post('/api/progress/entry-1711540000-a1b2/learn');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.learned_at).toBeDefined();
    expect(typeof res.body.learned_at).toBe('string');
  });

  test('GET /api/progress reflects marked entries', async () => {
    // Mark an entry first
    await request(app).post('/api/progress/entry-1711540000-a1b2/learn');

    const res = await request(app).get('/api/progress');

    expect(res.status).toBe(200);
    expect(res.body.learned_entries).toHaveProperty('entry-1711540000-a1b2');
    expect(res.body.learned_entries['entry-1711540000-a1b2'].learned_at).toBeDefined();
  });

  test('DELETE /api/progress/:entryId/learn unmarks entry', async () => {
    // Mark then unmark
    await request(app).post('/api/progress/entry-1711540000-a1b2/learn');
    const res = await request(app)
      .delete('/api/progress/entry-1711540000-a1b2/learn');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify it's gone
    const check = await request(app).get('/api/progress');
    expect(check.body.learned_entries).not.toHaveProperty('entry-1711540000-a1b2');
  });

  test('POST is idempotent — marking already-learned entry succeeds', async () => {
    await request(app).post('/api/progress/entry-1711540000-a1b2/learn');
    const res = await request(app)
      .post('/api/progress/entry-1711540000-a1b2/learn');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('DELETE on unlearned entry succeeds gracefully', async () => {
    const res = await request(app)
      .delete('/api/progress/entry-nonexistent/learn');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
