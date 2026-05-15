import * as path from 'path';
import type { LanguageModel } from 'ai';
import { PROVIDERS, parseEnvFile } from '@owenbush/decodie-core';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createMistral } from '@ai-sdk/mistral';
import { createXai } from '@ai-sdk/xai';

export interface ResolvedProvider {
  model: LanguageModel;
  providerName: string;
}

function createModel(
  providerId: string,
  apiKey: string,
  modelId: string,
  baseURL?: string,
): LanguageModel {
  switch (providerId) {
    case 'anthropic':
      return createAnthropic({ apiKey })(modelId);
    case 'openai':
      return createOpenAI({ apiKey, ...(baseURL && { baseURL }) })(modelId);
    case 'google':
      return createGoogleGenerativeAI({ apiKey })(modelId);
    case 'mistral':
      return createMistral({ apiKey })(modelId);
    case 'xai':
      return createXai({ apiKey })(modelId);
    case 'deepseek':
      return createOpenAI({ apiKey, baseURL: 'https://api.deepseek.com/v1' })(modelId);
    default:
      throw new Error(`Unsupported provider: ${providerId}`);
  }
}

export function resolveProvider(projectDir: string): ResolvedProvider | null {
  const envPath = path.join(projectDir, '.decodie', '.env');
  const env = parseEnvFile(envPath);
  const modelOverride = env.LLM_MODEL || process.env.LLM_MODEL;

  for (const provider of PROVIDERS) {
    const apiKey = env[provider.envKey] || process.env[provider.envKey];
    if (!apiKey) continue;

    const baseURL =
      provider.id === 'openai'
        ? env.OPENAI_BASE_URL || process.env.OPENAI_BASE_URL
        : undefined;

    const modelId = modelOverride || provider.defaultModel;
    return { model: createModel(provider.id, apiKey, modelId, baseURL), providerName: provider.id };
  }

  // Backwards compat: CLAUDE_API_KEY → Anthropic
  const legacyKey = env.CLAUDE_API_KEY || process.env.CLAUDE_API_KEY;
  if (legacyKey) {
    console.warn('[decodie] CLAUDE_API_KEY is deprecated. Use ANTHROPIC_API_KEY instead.');
    const modelId = modelOverride || 'claude-sonnet-4-6';
    return { model: createAnthropic({ apiKey: legacyKey })(modelId), providerName: 'anthropic' };
  }

  if (env.CLAUDE_CODE_OAUTH_TOKEN || process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    console.warn(
      '[decodie] CLAUDE_CODE_OAUTH_TOKEN is no longer supported. Use ANTHROPIC_API_KEY instead.',
    );
  }

  return null;
}
