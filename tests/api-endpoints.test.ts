import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import request from 'supertest';
import { createApp } from '../src/server/index';

/**
 * Set up a temporary project directory that mirrors the fixture structure.
 * The DataParser expects projectDir/.decodie/ to contain the data files.
 * For mutation tests (PATCH), we use a temp copy so we don't modify fixtures.
 */

let tempDir: string;
let app: ReturnType<typeof createApp>['app'];

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
  // Create temp dir with .decodie/ structure
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'learning-test-'));
  const fixtureDir = path.resolve(__dirname, './fixtures/decodie');
  const learningDir = path.join(tempDir, '.decodie');
  copyDirSync(fixtureDir, learningDir);

  // Also copy mock-project source files into tempDir so reference resolution works
  const mockProjectSrc = path.resolve(__dirname, './fixtures/mock-project/src');
  copyDirSync(mockProjectSrc, path.join(tempDir, 'src'));

  const result = createApp(tempDir);
  app = result.app;
});

afterAll(() => {
  // Clean up temp directory
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe('API endpoints', () => {
  test('GET /api/entries returns all entries', async () => {
    const res = await request(app).get('/api/entries');

    expect(res.status).toBe(200);
    expect(res.body.project).toBe('secure-api-platform');
    expect(res.body.total).toBe(5);
    expect(res.body.entries).toHaveLength(5);

    // Each entry should have reference_resolutions
    for (const entry of res.body.entries) {
      expect(entry).toHaveProperty('reference_resolutions');
      expect(Array.isArray(entry.reference_resolutions)).toBe(true);
    }
  });

  test('GET /api/entries filters by lifecycle', async () => {
    const res = await request(app).get('/api/entries?lifecycle=active');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    for (const entry of res.body.entries) {
      expect(entry.lifecycle).toBe('active');
    }
  });

  test('GET /api/entries/:id returns full entry with content', async () => {
    const res = await request(app).get('/api/entries/entry-1711540000-a1b2');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('entry-1711540000-a1b2');
    expect(res.body.title).toBe('Bearer token validation must check both format and expiry');

    // Should have session content merged in
    expect(res.body.code_snippet).toBeDefined();
    expect(res.body.explanation).toBeDefined();
    expect(res.body.alternatives_considered).toBeDefined();
    expect(res.body.key_concepts).toBeDefined();
    expect(Array.isArray(res.body.key_concepts)).toBe(true);

    // Should have reference resolutions
    expect(res.body.reference_resolutions).toBeDefined();
    expect(res.body.reference_resolutions).toHaveLength(1);
    expect(res.body.reference_resolutions[0].status).toBe('resolved');
  });

  test('GET /api/entries/:id returns 404 for unknown entry', async () => {
    const res = await request(app).get('/api/entries/entry-nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('not found');
  });

  test('PATCH /api/entries/:id updates lifecycle', async () => {
    const res = await request(app)
      .patch('/api/entries/entry-1711540000-a1b2')
      .send({ lifecycle: 'archived' });

    expect(res.status).toBe(200);
    expect(res.body.lifecycle).toBe('archived');
    expect(res.body.id).toBe('entry-1711540000-a1b2');

    // Verify the change persists by reading the entry again
    const verify = await request(app).get('/api/entries/entry-1711540000-a1b2');
    expect(verify.body.lifecycle).toBe('archived');
  });

  test('GET /api/config returns config with defaults merged', async () => {
    const res = await request(app).get('/api/config');

    expect(res.status).toBe(200);
    // Values from our config fixture
    expect(res.body.user_experience_level).toBe('intermediate');
    expect(res.body.archival_threshold_days).toBe(60);
    // Default values that were not in the fixture
    expect(res.body.auto_suggest_archival).toBe(true);
    expect(res.body.show_external_docs).toBe(true);
    expect(res.body.default_view).toBe('active');
    expect(res.body.sessions_visible_by_default).toBe(5);
  });

  test('GET /api/config/status returns summary stats', async () => {
    const res = await request(app).get('/api/config/status');

    expect(res.status).toBe(200);
    expect(res.body.total_entries).toBe(5);
    // Note: PATCH test above may have changed entry 1 to archived
    expect(typeof res.body.active).toBe('number');
    expect(typeof res.body.archived).toBe('number');
    expect(typeof res.body.superseded).toBe('number');
    expect(typeof res.body.stale_references).toBe('number');
    expect(res.body.sessions).toBe(2);
    expect(res.body.last_updated).toBeDefined();
  });
});
