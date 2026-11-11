import { describe, expect, test } from 'vitest';
import { expressRouteMissingAuth } from '../../src/rules/express-route-missing-auth.js';
import { scan } from '../../src/scanner/scan.js';
import { fixturePath } from '../helpers.js';

const rules = [expressRouteMissingAuth];
const VULNERABLE = fixturePath('express-route-missing-auth', 'vulnerable');

describe('express-route-missing-auth', () => {
  test('flags mutating routes with no auth middleware or check', async () => {
    const result = await scan({ root: VULNERABLE, rules });

    const flagged = result.findings.map((f) => `${f.file}:${f.line}`);

    expect(flagged).toEqual(['routes.ts:11', 'routes.ts:15', 'server.js:5']);
  });

  test('names the method and path, and warns about id parameters', async () => {
    const result = await scan({ root: VULNERABLE, rules });

    const deleteFinding = result.findings.find((f) => f.line === 15 && f.file === 'routes.ts');

    expect(deleteFinding?.message).toContain('DELETE /api/products/:id');
    expect(deleteFinding?.message).toContain(':id');
    expect(deleteFinding).toMatchObject({ severity: 'high' });
    expect(deleteFinding?.remediation.example).toContain('authenticate');
  });

  test('does not flag GET routes or routes with auth middleware', async () => {
    const result = await scan({ root: VULNERABLE, rules });

    expect(result.findings.some((f) => f.line === 7 || f.line === 20)).toBe(false);
  });

  test('accepts auth middleware, in-handler checks, router-wide guards, public auth paths and client calls', async () => {
    const result = await scan({ root: fixturePath('express-route-missing-auth', 'safe'), rules });

    expect(result.filesScanned).toBe(3);
    expect(result.findings).toEqual([]);
  });
});
