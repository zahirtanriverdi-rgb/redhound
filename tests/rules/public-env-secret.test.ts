import { describe, expect, test } from 'vitest';
import { publicEnvSecret } from '../../src/rules/public-env-secret.js';
import { scan } from '../../src/scanner/scan.js';
import { fixturePath } from '../helpers.js';

const rules = [publicEnvSecret];

describe('public-env-secret', () => {
  test('flags server-only provider keys, secret keys and database URLs behind a public prefix', async () => {
    const result = await scan({ root: fixturePath('public-env-secret', 'vulnerable'), rules });

    const flagged = result.findings.map((f) => `${f.file}:${f.line}`);

    expect(flagged).toEqual(['config.ts:2', 'config.ts:3', 'lib/openai.ts:4']);
    expect(result.findings.every((f) => f.severity === 'critical')).toBe(true);
  });

  test('names the variable and suggests the name without the public prefix', async () => {
    const result = await scan({ root: fixturePath('public-env-secret', 'vulnerable'), rules });

    const finding = result.findings.find((f) => f.file === 'lib/openai.ts');

    expect(finding?.message).toContain('NEXT_PUBLIC_OPENAI_API_KEY');
    expect(finding?.remediation.summary).toContain('OPENAI_API_KEY');
  });

  test('ignores keys that are public by design and secrets without a public prefix', async () => {
    const result = await scan({ root: fixturePath('public-env-secret', 'safe'), rules });

    expect(result.filesScanned).toBe(1);
    expect(result.findings).toEqual([]);
  });

  test('leaves the service role key to the dedicated Supabase rule', async () => {
    const result = await scan({ root: fixturePath('supabase-service-role-client', 'vulnerable') });

    const ruleIds = new Set(result.findings.map((f) => f.ruleId));

    expect([...ruleIds]).toEqual(['supabase-service-role-client']);
  });
});
