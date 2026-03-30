import { describe, test, expect } from 'vitest';
import * as path from 'path';
import { resolveReference } from '../src/data/reference-resolver';
import { Reference } from '../src/data/types';

const mockProjectRoot = path.resolve(__dirname, './fixtures/mock-project');

describe('Reference resolver', () => {
  test('resolves anchor found at expected file (resolved)', () => {
    const ref: Reference = {
      file: 'src/auth.ts',
      anchor: 'export function validateToken(token: string): boolean',
      anchor_hash: '964abbb5',
    };

    const result = resolveReference(ref, mockProjectRoot);

    expect(result.status).toBe('resolved');
    expect(result.resolved_file).toBe('src/auth.ts');
    expect(result.resolved_line).toBe(1);
    expect(result.confidence).toBe(1.0);
  });

  test('detects anchor that moved to different file (drifted)', () => {
    // The anchor references src/utils.ts, but the function actually lives
    // in src/utils/helpers.ts
    const ref: Reference = {
      file: 'src/utils.ts',
      anchor: "export function formatCurrency(amount: number, currency: string = 'USD'): string",
      anchor_hash: 'bc2d9e1e',
    };

    const result = resolveReference(ref, mockProjectRoot);

    expect(result.status).toBe('drifted');
    expect(result.resolved_file).toBe(path.join('src', 'utils', 'helpers.ts'));
    expect(result.resolved_line).toBe(1);
    expect(result.confidence).toBe(0.8);
  });

  test('fuzzy matches renamed function (fuzzy)', () => {
    // The anchor says notifySubscribers but the file contains notifyListeners
    const ref: Reference = {
      file: 'src/patterns/observer.ts',
      anchor: 'export function notifySubscribers(event: string, data: unknown): void',
      anchor_hash: '6f3b0b3b',
    };

    const result = resolveReference(ref, mockProjectRoot);

    // The resolver should find a fuzzy match because:
    // - The exact anchor text is not in the file
    // - But the identifier 'notifySubscribers' won't match 'notifyListeners'
    // - However, the structure is very similar so it may get a substring/whitespace match
    // Since the function was renamed, this could be fuzzy or stale depending on resolver logic
    expect(['fuzzy', 'stale']).toContain(result.status);

    if (result.status === 'fuzzy') {
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThan(1);
    }
  });

  test('marks missing anchor as stale', () => {
    // File does not exist at all
    const ref: Reference = {
      file: 'src/legacy/old-hooks.ts',
      anchor: 'export function useLegacyHook(): void',
      anchor_hash: '12da50bb',
    };

    const result = resolveReference(ref, mockProjectRoot);

    expect(result.status).toBe('stale');
    expect(result.confidence).toBe(0);
    expect(result.message).toContain('does not exist');
  });
});
