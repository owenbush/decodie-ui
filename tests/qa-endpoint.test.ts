import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import request from 'supertest';
import { createApp } from '../src/server/index';

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
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'learning-qa-test-'));
  const fixtureDir = path.resolve(__dirname, './fixtures/decodie');
  const learningDir = path.join(tempDir, '.decodie');
  copyDirSync(fixtureDir, learningDir);

  const mockProjectSrc = path.resolve(__dirname, './fixtures/mock-project/src');
  copyDirSync(mockProjectSrc, path.join(tempDir, 'src'));

  const result = createApp(tempDir);
  app = result.app;
});

afterAll(() => {
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe('Q&A endpoint', () => {
  test('GET /api/qa/status returns disabled when no auth configured', async () => {
    const res = await request(app).get('/api/qa/status');

    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
    expect(res.body.auth_method).toBeNull();
  });

  test('POST /api/qa returns 503 when no auth configured', async () => {
    const res = await request(app)
      .post('/api/qa')
      .send({
        entry_id: 'entry-1711540000-a1b2',
        question: 'What does this do?',
      });

    expect(res.status).toBe(503);
    expect(res.body.error).toContain('.decodie/.env');
  });
});
