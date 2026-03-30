import { describe, test, expect } from 'vitest';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import * as fs from 'fs';
import * as path from 'path';

const schemaDir = path.resolve(__dirname, '../../decodie-skill/schema');
const fixtureDir = path.resolve(__dirname, './fixtures/decodie');

function loadJSON(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function createValidator() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv;
}

describe('Schema validation', () => {
  test('index.json fixture validates against index schema', () => {
    const ajv = createValidator();
    const schema = loadJSON(path.join(schemaDir, 'index.schema.json'));
    const fixture = loadJSON(path.join(fixtureDir, 'index.json'));

    const validate = ajv.compile(schema as object);
    const valid = validate(fixture);

    expect(valid).toBe(true);
    if (!valid) {
      console.error('Validation errors:', validate.errors);
    }
  });

  test('session file fixture validates against session schema', () => {
    const ajv = createValidator();
    const schema = loadJSON(path.join(schemaDir, 'session.schema.json'));

    const session1 = loadJSON(path.join(fixtureDir, 'sessions', '2026-03-27-001.json'));
    const validate = ajv.compile(schema as object);
    expect(validate(session1)).toBe(true);

    const session2 = loadJSON(path.join(fixtureDir, 'sessions', '2026-03-27-002.json'));
    expect(validate(session2)).toBe(true);
  });

  test('config.json fixture validates against config schema', () => {
    const ajv = createValidator();
    const schema = loadJSON(path.join(schemaDir, 'config.schema.json'));
    const fixture = loadJSON(path.join(fixtureDir, 'config.json'));

    const validate = ajv.compile(schema as object);
    const valid = validate(fixture);

    expect(valid).toBe(true);
    if (!valid) {
      console.error('Validation errors:', validate.errors);
    }
  });

  test('index with unknown additional fields passes validation (forward compat)', () => {
    const ajv = createValidator();
    const schema = loadJSON(path.join(schemaDir, 'index.schema.json'));
    const fixture = loadJSON(path.join(fixtureDir, 'index.json')) as {
      entries: Array<Record<string, unknown>>;
    };

    // Add an unknown field to the first entry (additionalProperties: true on entries)
    fixture.entries[0].custom_metadata = { team: 'platform', priority: 'high' };

    const validate = ajv.compile(schema as object);
    const valid = validate(fixture);

    expect(valid).toBe(true);
  });

  test('malformed index (missing required field) fails validation', () => {
    const ajv = createValidator();
    const schema = loadJSON(path.join(schemaDir, 'index.schema.json'));

    // Missing 'entries' field
    const malformed = {
      version: '1.0',
      project: 'test-project',
    };

    const validate = ajv.compile(schema as object);
    const valid = validate(malformed);

    expect(valid).toBe(false);
    expect(validate.errors).toBeDefined();
    expect(validate.errors!.some((e) => e.message?.includes('entries') || e.params?.missingProperty === 'entries')).toBe(true);
  });
});
