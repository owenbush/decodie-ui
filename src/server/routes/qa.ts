import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { DataParser } from '@owenbush/decodie-core';

interface QAAuth {
  method: 'oauth-token' | 'api-key';
  token: string;
}

export function createQARouter(parser: DataParser, projectDir: string): Router {
  const router = Router();
  const envPath = path.join(projectDir, '.decodie', '.env');

  /**
   * Read auth from .decodie/.env file or process.env.
   *
   * .env format:
   *   # Option A: OAuth token (from `claude setup-token`)
   *   CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...
   *
   *   # Option B: API key (from console.anthropic.com)
   *   CLAUDE_API_KEY=sk-ant-api03-...
   */
  function loadAuth(): QAAuth | null {
    const env = loadEnvFile();

    // .env file takes precedence
    if (env.CLAUDE_CODE_OAUTH_TOKEN) {
      return { method: 'oauth-token', token: env.CLAUDE_CODE_OAUTH_TOKEN };
    }
    if (env.CLAUDE_API_KEY) {
      return { method: 'api-key', token: env.CLAUDE_API_KEY };
    }

    // Fall back to process.env (e.g. set by DDEV daemon script)
    if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
      return { method: 'oauth-token', token: process.env.CLAUDE_CODE_OAUTH_TOKEN };
    }
    if (process.env.CLAUDE_API_KEY) {
      return { method: 'api-key', token: process.env.CLAUDE_API_KEY };
    }

    return null;
  }

  function loadEnvFile(): Record<string, string> {
    const result: Record<string, string> = {};
    if (!fs.existsSync(envPath)) return result;
    try {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx < 0) continue;
        const key = trimmed.substring(0, eqIdx).trim();
        let val = trimmed.substring(eqIdx + 1).trim();
        // Strip surrounding quotes (single or double)
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        result[key] = val;
      }
    } catch {
      // ignore read errors
    }
    return result;
  }

  /**
   * GET /api/qa/status
   */
  router.get('/api/qa/status', (_req: Request, res: Response) => {
    const auth = loadAuth();
    res.json({
      enabled: !!auth,
      auth_method: auth?.method ?? null,
    });
  });

  /**
   * POST /api/qa
   * Streams a Q&A response via SSE.
   */
  router.post('/api/qa', async (req: Request, res: Response) => {
    const auth = loadAuth();
    if (!auth) {
      res.status(503).json({
        error: 'Q&A is not configured. Add CLAUDE_CODE_OAUTH_TOKEN or CLAUDE_API_KEY to .decodie/.env',
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

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      if (auth.method === 'api-key') {
        await streamViaApiKey(auth.token, null, systemPrompt, messages, res);
      } else {
        const fullPrompt = systemPrompt + '\n\nDeveloper\'s question: ' + question;
        await streamViaAgentSdk(auth.token, null, fullPrompt, res);
      }
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

async function streamViaApiKey(
  apiKey: string,
  apiModel: string | null,
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  res: import('express').Response
) {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey });
  const model = apiModel || 'claude-sonnet-4-20250514';

  const stream = client.messages.stream({
    model,
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  });

  stream.on('text', (text) => {
    res.write(`data: ${JSON.stringify({ type: 'delta', text })}\n\n`);
  });

  stream.on('error', (err) => {
    res.write(
      `data: ${JSON.stringify({ type: 'error', error: (err as Error).message })}\n\n`
    );
    res.write('data: [DONE]\n\n');
    res.end();
  });

  stream.on('end', () => {
    res.write('data: [DONE]\n\n');
    res.end();
  });

  res.on('close', () => {
    stream.abort();
  });
}

async function streamViaAgentSdk(
  oauthToken: string,
  apiModel: string | null,
  prompt: string,
  res: import('express').Response
) {
  const { query } = await import('@anthropic-ai/claude-agent-sdk');
  const model = apiModel || 'claude-sonnet-4-20250514';

  const conversation = query({
    prompt,
    options: {
      model,
      maxTurns: 1,
      env: { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: oauthToken },
    },
  });

  let aborted = false;
  res.on('close', () => { aborted = true; });

  try {
    for await (const message of conversation) {
      if (aborted) break;
      if (message.type === 'assistant' && message.message) {
        const content = message.message.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text' && block.text) {
              res.write(`data: ${JSON.stringify({ type: 'delta', text: block.text })}\n\n`);
            }
          }
        }
      }
    }
  } catch (err) {
    if (!aborted) {
      const raw = (err as Error).message || '';
      let friendly: string;
      if (raw.includes('Invalid bearer token') || raw.includes('authentication_error')) {
        friendly = 'Authentication failed. Your OAuth token may have expired. Run `claude setup-token` to generate a new one and update .decodie/.env';
      } else if (raw.includes('Failed to spawn')) {
        friendly = 'Could not start Claude Code. Make sure it is installed and accessible.';
      } else {
        friendly = raw;
      }
      res.write(
        `data: ${JSON.stringify({ type: 'error', error: friendly })}\n\n`
      );
    }
  }

  if (!aborted) {
    res.write('data: [DONE]\n\n');
    res.end();
  }
}
