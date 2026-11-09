import { describe, expect, test } from 'vitest';
import { firebaseOpenRules } from '../../src/rules/firebase-open-rules.js';
import { scan } from '../../src/scanner/scan.js';
import { fixturePath } from '../helpers.js';

const rules = [firebaseOpenRules];
const VULNERABLE = fixturePath('firebase-open-rules', 'vulnerable');

describe('firebase-open-rules', () => {
  test('flags Firestore rules that let anyone write', async () => {
    const result = await scan({ root: VULNERABLE, rules });

    const finding = result.findings.find((f) => f.file === 'firestore.rules');

    expect(finding).toMatchObject({ severity: 'critical', line: 5, column: 7 });
  });

  test('flags the expiring test-mode rule in Storage rules', async () => {
    const result = await scan({ root: VULNERABLE, rules });

    const finding = result.findings.find((f) => f.file === 'storage.rules');

    expect(finding).toMatchObject({ severity: 'critical', line: 5 });
    expect(finding?.message).toContain('test mode');
  });

  test('flags open Realtime Database rules, write more severely than read', async () => {
    const result = await scan({ root: VULNERABLE, rules });

    const findings = result.findings
      .filter((f) => f.file === 'database.rules.json')
      .map((f) => ({ line: f.line, severity: f.severity }));

    expect(findings).toEqual([
      { line: 4, severity: 'critical' },
      { line: 3, severity: 'medium' },
    ]);
  });

  test('reports public read-only access as medium so intentional cases stay quiet', async () => {
    const result = await scan({ root: VULNERABLE, rules });

    const findings = result.findings.filter((f) => f.file === 'public-read/firestore.rules');

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: 'medium', line: 5 });
  });

  test('ignores authenticated rules and commented-out open rules', async () => {
    const result = await scan({ root: fixturePath('firebase-open-rules', 'safe'), rules });

    expect(result.filesScanned).toBe(2);
    expect(result.findings).toEqual([]);
  });
});
