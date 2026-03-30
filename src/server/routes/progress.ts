import { Router, Request, Response } from 'express';
import { ProgressStore } from '../../data/progress-store';

export function createProgressRouter(progressStore: ProgressStore): Router {
  const router = Router();

  // GET / — get all progress data
  router.get('/', (_req: Request, res: Response) => {
    try {
      const progress = progressStore.loadProgress();
      res.json(progress);
    } catch {
      res.json({ learned_entries: {} });
    }
  });

  // POST /:entryId/learn — mark entry as learned
  router.post('/:entryId/learn', (req: Request, res: Response) => {
    try {
      const entry = progressStore.markLearned(req.params.entryId);
      res.json({ success: true, learned_at: entry.learned_at });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // DELETE /:entryId/learn — unmark entry as learned
  router.delete('/:entryId/learn', (req: Request, res: Response) => {
    try {
      progressStore.unmarkLearned(req.params.entryId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return router;
}
