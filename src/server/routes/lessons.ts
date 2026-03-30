import { Router, Request, Response } from 'express';
import { LessonService } from '../../data/lesson-service';

export function createLessonsRouter(lessonService: LessonService): Router {
  const router = Router();

  // GET / — list all lessons (auto + custom)
  router.get('/', (_req: Request, res: Response) => {
    try {
      res.json(lessonService.getAllLessons());
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // GET /:id — get lesson detail
  router.get('/:id', (req: Request, res: Response) => {
    try {
      const detail = lessonService.getLessonDetail(req.params.id);
      res.json(detail);
    } catch (err) {
      res.status(404).json({ error: (err as Error).message });
    }
  });

  // POST / — create custom lesson
  router.post('/', (req: Request, res: Response) => {
    try {
      const lesson = lessonService.createCustomLesson(req.body);
      res.status(201).json(lesson);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // PUT /:id — update custom lesson
  router.put('/:id', (req: Request, res: Response) => {
    if (req.params.id.startsWith('auto-')) {
      res.status(400).json({ error: 'Cannot modify auto-generated lessons' });
      return;
    }
    try {
      const lesson = lessonService.updateCustomLesson(req.params.id, req.body);
      res.json(lesson);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // DELETE /:id — delete custom lesson
  router.delete('/:id', (req: Request, res: Response) => {
    if (req.params.id.startsWith('auto-')) {
      res.status(400).json({ error: 'Cannot delete auto-generated lessons' });
      return;
    }
    try {
      lessonService.deleteCustomLesson(req.params.id);
      res.json({ deleted: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return router;
}
