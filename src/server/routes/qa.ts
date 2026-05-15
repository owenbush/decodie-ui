import { Router, Request, Response } from 'express';
import { DataParser } from '@owenbush/decodie-core';
import { streamText } from 'ai';
import { resolveProvider } from '../llm/provider';

export function createQARouter(parser: DataParser, projectDir: string): Router {
  const router = Router();

  /**
   * GET /api/qa/status
   */
  router.get('/api/qa/status', (_req: Request, res: Response) => {
    const resolved = resolveProvider(projectDir);
    res.json({
      enabled: !!resolved,
      provider: resolved?.providerName ?? null,
    });
  });

  /**
   * POST /api/qa
   * Streams a Q&A response via SSE.
   */
  router.post('/api/qa', async (req: Request, res: Response) => {
    const resolved = resolveProvider(projectDir);
    if (!resolved) {
      res.status(503).json({
        error: 'Q&A is not configured. Add an API key (e.g. ANTHROPIC_API_KEY or OPENAI_API_KEY) to .decodie/.env',
      });
      return;
    }

    const { entry_id, selected_text, question, conversation } = req.body;

    if (!entry_id || !question) {
      res.status(400).json({ error: 'entry_id and question are required' });
      return;
    }

    let entry;
    try {
      entry = parser.getEntryWithContent(entry_id);
    } catch (err) {
      res.status(404).json({ error: (err as Error).message });
      return;
    }

    const systemPrompt = `You are explaining a coding concept to a developer who is reviewing learning entries generated during an AI-assisted coding session.

Here is the learning entry they are reading:

Title: ${entry.title}
Code:
\`\`\`
${entry.code_snippet || '(no code snippet)'}
\`\`\`
Explanation: ${entry.explanation || '(no explanation)'}
Alternatives Considered: ${entry.alternatives_considered || '(none)'}
Key Concepts: ${(entry.key_concepts || []).join(', ') || '(none)'}

The developer has selected this text: "${selected_text || '(no specific selection)'}"

Answer concisely and helpfully. Reference the specific code when relevant. If the question goes beyond what the entry covers, say so and explain what you can.`;

    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    if (conversation && Array.isArray(conversation)) {
      for (const turn of conversation) {
        if (turn.role === 'user' || turn.role === 'assistant') {
          messages.push({ role: turn.role, content: turn.content });
        }
      }
    }
    messages.push({ role: 'user', content: question });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      let streamError: unknown;
      const result = streamText({
        model: resolved.model,
        system: systemPrompt,
        messages,
        maxOutputTokens: 1024,
        abortSignal: createAbortSignal(res),
        onError({ error }) {
          streamError = error;
        },
      });

      for await (const delta of result.textStream) {
        res.write(`data: ${JSON.stringify({ type: 'delta', text: delta })}\n\n`);
      }

      if (streamError) throw streamError;

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (err) {
      res.write(
        `data: ${JSON.stringify({ type: 'error', error: (err as Error).message })}\n\n`
      );
      res.write('data: [DONE]\n\n');
      res.end();
    }
  });

  return router;
}

function createAbortSignal(res: Response): AbortSignal {
  const controller = new AbortController();
  res.on('close', () => controller.abort());
  return controller.signal;
}
