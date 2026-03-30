import express from 'express';
import * as path from 'path';
import * as chokidar from 'chokidar';
import { DataParser } from '../data/parser';
import { createEntriesRouter } from './routes/entries';
import { createConfigRouter } from './routes/config';
import { createQARouter } from './routes/qa';
import { createConversationsRouter } from './routes/conversations';

export interface ServerOptions {
  port: number;
  projectDir: string;
}

export function createApp(projectDir: string): {
  app: express.Application;
  parser: DataParser;
} {
  const app = express();
  const parser = new DataParser(projectDir);

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

  // Fallback to index.html for SPA routing
  app.get('*', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  return { app, parser };
}

export function startServer(options: ServerOptions): void {
  const { port, projectDir } = options;
  const { app, parser } = createApp(projectDir);

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
