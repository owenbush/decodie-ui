import express from 'express';
import * as path from 'path';
import * as chokidar from 'chokidar';
import { DataParser } from '../data/parser';
import { ProgressStore } from '../data/progress-store';
import { LessonService } from '../data/lesson-service';
import { createEntriesRouter } from './routes/entries';
import { createConfigRouter } from './routes/config';
import { createQARouter } from './routes/qa';
import { createConversationsRouter } from './routes/conversations';
import { createProgressRouter } from './routes/progress';
import { createLessonsRouter } from './routes/lessons';

export interface ServerOptions {
  port: number;
  projectDir: string;
}

export function createApp(projectDir: string): {
  app: express.Application;
  parser: DataParser;
  progressStore: ProgressStore;
  lessonService: LessonService;
} {
  const app = express();
  const parser = new DataParser(projectDir);
  const progressStore = new ProgressStore(projectDir);
  const lessonService = new LessonService(parser, progressStore, projectDir);

  // Parse JSON request bodies
  app.use(express.json());

  // Serve static files from the public directory
  const publicDir = path.join(__dirname, '..', 'public');
  app.use(express.static(publicDir));

  // Mount API routes
  app.use('/api/entries', createEntriesRouter(parser, projectDir));
  app.use('/api/config', createConfigRouter(parser));
  app.use(createQARouter(parser, projectDir));
  app.use('/api/conversations', createConversationsRouter(projectDir));
  app.use('/api/progress', createProgressRouter(progressStore));
  app.use('/api/lessons', createLessonsRouter(lessonService));

  // Fallback to index.html for SPA routing
  app.get('*', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  return { app, parser, progressStore, lessonService };
}

export function startServer(options: ServerOptions): void {
  const { port, projectDir } = options;
  const { app, parser, progressStore, lessonService } = createApp(projectDir);

  // Watch .decodie/ directory for changes and invalidate cache
  const decodieDir = path.join(projectDir, '.decodie');
  const watcher = chokidar.watch(decodieDir, {
    ignoreInitial: true,
    persistent: true,
    depth: 3,
  });

  watcher.on('all', (event, filePath) => {
    if (filePath.endsWith('.json')) {
      parser.invalidateCache();
      progressStore.invalidateCache();
      lessonService.invalidateCache();
      console.log(`[watcher] ${event}: ${path.relative(projectDir, filePath)} — cache invalidated`);
    }
  });

  app.listen(port, () => {
    console.log(`Decodie server running at http://localhost:${port}`);
    console.log(`Project directory: ${projectDir}`);
    console.log(`Watching: ${decodieDir}`);
  });

  // Clean up watcher on process exit
  process.on('SIGINT', () => {
    watcher.close();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    watcher.close();
    process.exit(0);
  });
}
