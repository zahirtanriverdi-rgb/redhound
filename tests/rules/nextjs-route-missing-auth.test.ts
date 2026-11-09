import { describe, expect, test } from 'vitest';
import { nextjsRouteMissingAuth } from '../../src/rules/nextjs-route-missing-auth.js';
import { scan } from '../../src/scanner/scan.js';
import { fixturePath } from '../helpers.js';

const rules = [nextjsRouteMissingAuth];

describe('nextjs-route-missing-auth', () => {
  test('flags mutating handlers that never check who is calling', async () => {
    const result = await scan({ root: fixturePath(rules[0]!.id, 'vulnerable'), rules });

    const flagged = result.findings.map((f) => ({ line: f.line, message: f.message }));

    expect(flagged).toHaveLength(2);
    expect(flagged[0]).toMatchObject({ line: 7 });
    expect(flagged[0]?.message).toContain('POST');
    expect(flagged[1]).toMatchObject({ line: 13 });
    expect(flagged[1]?.message).toContain('DELETE');
  });

  test('does not flag read-only GET handlers', async () => {
    const result = await scan({ root: fixturePath(rules[0]!.id, 'vulnerable'), rules });

    expect(result.findings.some((f) => f.message.includes('GET'))).toBe(false);
  });

  test('reports findings as high severity with a remediation example', async () => {
    const result = await scan({ root: fixturePath(rules[0]!.id, 'vulnerable'), rules });

    for (const finding of result.findings) {
      expect(finding.severity).toBe('high');
      expect(finding.file).toBe('app/api/posts/route.ts');
      expect(finding.remediation.example).toBeDefined();
    }
  });

  test('accepts session checks, wrapped handlers, verified webhooks and non-route files', async () => {
    const result = await scan({ root: fixturePath(rules[0]!.id, 'safe'), rules });

    expect(result.filesScanned).toBe(4);
    expect(result.findings).toEqual([]);
  });
});
