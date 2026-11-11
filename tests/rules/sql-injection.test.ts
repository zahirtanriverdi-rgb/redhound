import { describe, expect, test } from 'vitest';
import { sqlInjection } from '../../src/rules/sql-injection.js';
import { scan } from '../../src/scanner/scan.js';
import { fixturePath } from '../helpers.js';

const rules = [sqlInjection];
const VULNERABLE = fixturePath('sql-injection', 'vulnerable');

describe('sql-injection', () => {
  test('flags request input written into SQL text by template or concatenation', async () => {
    const result = await scan({ root: VULNERABLE, rules });

    const flagged = result.findings.map((f) => `${f.file}:${f.line}`);

    expect(flagged).toEqual(['app/api/search/route.ts:5', 'users.ts:8', 'users.ts:14', 'users.ts:21']);
  });

  test('names the interpolated input and suggests parameters', async () => {
    const result = await scan({ root: VULNERABLE, rules });

    const orderBy = result.findings.find((f) => f.line === 8);

    expect(orderBy?.message).toContain('sort');
    expect(orderBy?.severity).toBe('critical');
    expect(orderBy?.remediation.example).toContain('$1');
  });

  test('follows the query through a variable and reads URL search params', async () => {
    const result = await scan({ root: VULNERABLE, rules });

    expect(result.findings.find((f) => f.line === 14)?.message).toContain('req.body.email');
    expect(result.findings.find((f) => f.file.endsWith('route.ts'))?.message).toContain('term');
  });

  test('accepts parameters, placeholder lists, numeric casts, fixed choices and tagged templates', async () => {
    const result = await scan({ root: fixturePath('sql-injection', 'safe'), rules });

    expect(result.filesScanned).toBe(1);
    expect(result.findings).toEqual([]);
  });
});
