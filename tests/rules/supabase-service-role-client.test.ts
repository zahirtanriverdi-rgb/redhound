import { describe, expect, test } from 'vitest';
import { supabaseServiceRoleClient } from '../../src/rules/supabase-service-role-client.js';
import { scan } from '../../src/scanner/scan.js';
import { fixturePath } from '../helpers.js';

const rules = [supabaseServiceRoleClient];

describe('supabase-service-role-client', () => {
  test('flags a service role key exposed through a public env prefix', async () => {
    const result = await scan({ root: fixturePath(rules[0]!.id, 'vulnerable'), rules });

    const finding = result.findings.find((f) => f.file === 'public-env.ts');

    expect(finding).toMatchObject({
      ruleId: 'supabase-service-role-client',
      severity: 'critical',
      line: 5,
    });
    expect(finding?.message).toContain('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY');
  });

  test('flags a service role key read inside a "use client" file', async () => {
    const result = await scan({ root: fixturePath(rules[0]!.id, 'vulnerable'), rules });

    const finding = result.findings.find((f) => f.file === 'client-component.tsx');

    expect(finding).toMatchObject({ severity: 'critical', line: 7 });
  });

  test('reports exactly one finding per vulnerable file', async () => {
    const result = await scan({ root: fixturePath(rules[0]!.id, 'vulnerable'), rules });

    expect(result.findings).toHaveLength(2);
  });

  test('every finding carries a remediation with an example', async () => {
    const result = await scan({ root: fixturePath(rules[0]!.id, 'vulnerable'), rules });

    for (const finding of result.findings) {
      expect(finding.remediation.summary.length).toBeGreaterThan(0);
      expect(finding.remediation.example).toBeDefined();
    }
  });

  test('ignores server-side usage and client-side anon keys', async () => {
    const result = await scan({ root: fixturePath(rules[0]!.id, 'safe'), rules });

    expect(result.filesScanned).toBe(2);
    expect(result.findings).toEqual([]);
  });
});
