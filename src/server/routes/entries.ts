import { Router, Request, Response } from 'express';
import { DataParser, resolveAllReferences, resolveReference, IndexEntry, IndexEntryWithResolution } from '@owenbush/decodie-core';

export function createEntriesRouter(parser: DataParser, projectRoot: string): Router {
  const router = Router();

  /**
   * GET /api/entries
   * Query params: level, topic, type, lifecycle, session, search
   */
  router.get('/', (req: Request, res: Response) => {
    try {
      const index = parser.loadIndex();
      let entries = index.entries;

      // Filter by experience_level
      const level = req.query.level as string | undefined;
      if (level) {
        entries = entries.filter((e) => e.experience_level === level);
      }

      // Filter by topic (entry must contain the topic)
      const topic = req.query.topic as string | undefined;
      if (topic) {
        entries = entries.filter((e) => e.topics.includes(topic));
      }

      // Filter by decision_type
      const type = req.query.type as string | undefined;
      if (type) {
        entries = entries.filter((e) => e.decision_type === type);
      }

      // Filter by lifecycle
      const lifecycle = req.query.lifecycle as string | undefined;
      if (lifecycle) {
        entries = entries.filter((e) => e.lifecycle === lifecycle);
      }

      // Filter by session_id
      const session = req.query.session as string | undefined;
      if (session) {
        entries = entries.filter((e) => e.session_id === session);
      }

      // Text search on titles
      const search = req.query.search as string | undefined;
      if (search) {
        const lower = search.toLowerCase();
        entries = entries.filter((e) => e.title.toLowerCase().includes(lower));
      }

      // Resolve references for all matching entries
      const resolutions = resolveAllReferences(entries, projectRoot);

      const result: IndexEntryWithResolution[] = entries.map((entry) => ({
        ...entry,
        reference_resolutions: resolutions.get(entry.id) ?? [],
      }));

      res.json({
        project: index.project,
        version: index.version,
        total: result.length,
        entries: result,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/entries/:id
   * Returns full entry merged with session content and resolved references.
   */
  router.get('/:id', (req: Request, res: Response) => {
    try {
      const entry = parser.getEntryWithContent(req.params.id);
      res.json(entry);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('not found')) {
        res.status(404).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  /**
   * PATCH /api/entries/:id
   * Update entry fields (lifecycle, pinned, etc.) and write to disk.
   */
  router.patch('/:id', (req: Request, res: Response) => {
    try {
      const updates = req.body as Partial<IndexEntry>;
      if (!updates || typeof updates !== 'object') {
        res.status(400).json({ error: 'Request body must be a JSON object' });
        return;
      }

      const updated = parser.updateEntry(req.params.id, updates);
      res.json(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('not found')) {
        res.status(404).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  return router;
}
