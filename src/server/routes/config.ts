import { Router, Request, Response } from 'express';
import { DataParser } from '@owenbush/decodie-core';

export function createConfigRouter(parser: DataParser): Router {
  const router = Router();

  /**
   * GET /api/config
   * Returns config.json contents or defaults.
   */
  router.get('/', (_req: Request, res: Response) => {
    try {
      const config = parser.loadConfig();
      res.json(config);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/status
   * Returns summary statistics about the learning entries.
   */
  router.get('/status', (_req: Request, res: Response) => {
    try {
      const stats = parser.getStats();
      res.json(stats);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  return router;
}
