import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

export function createConversationsRouter(projectDir: string): Router {
  const router = Router();
  const conversationsDir = path.join(projectDir, '.decodie', 'conversations');

  // GET / — list entry IDs that have conversations
  router.get('/', (_req: Request, res: Response) => {
    if (!fs.existsSync(conversationsDir)) {
      res.json({ conversations: [] });
      return;
    }
    try {
      const files = fs.readdirSync(conversationsDir)
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''));
      res.json({ conversations: files });
    } catch {
      res.json({ conversations: [] });
    }
  });

  // GET /:entryId — get full conversation
  router.get('/:entryId', (req: Request, res: Response) => {
    const filePath = path.join(conversationsDir, req.params.entryId + '.json');
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'No conversation found' });
      return;
    }
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      res.json(data);
    } catch {
      res.status(500).json({ error: 'Failed to read conversation' });
    }
  });

  // PUT /:entryId — save/update conversation
  router.put('/:entryId', (req: Request, res: Response) => {
    try {
      if (!fs.existsSync(conversationsDir)) {
        fs.mkdirSync(conversationsDir, { recursive: true });
      }
      const filePath = path.join(conversationsDir, req.params.entryId + '.json');
      fs.writeFileSync(filePath, JSON.stringify(req.body, null, 2) + '\n', 'utf-8');
      res.json({ saved: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // DELETE /:entryId — delete conversation
  router.delete('/:entryId', (req: Request, res: Response) => {
    const filePath = path.join(conversationsDir, req.params.entryId + '.json');
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      res.json({ deleted: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return router;
}
