import { describe, expect, test } from 'vitest';
import { commandInjection } from '../../src/rules/command-injection.js';
import { scan } from '../../src/scanner/scan.js';
import { fixturePath } from '../helpers.js';

const rules = [commandInjection];
const VULNERABLE = fixturePath('command-injection', 'vulnerable');

describe('command-injection', () => {
  test('flags request input reaching a shell or the command being run', async () => {
    const result = await scan({ root: VULNERABLE, rules });

    const flagged = result.findings.map((f) => `${f.file}:${f.line}`);

    expect(flagged).toEqual(['convert.ts:8', 'convert.ts:14', 'convert.ts:19', 'ping.js:4']);
  });

  test('explains whether the shell or the command itself is the problem', async () => {
    const result = await scan({ root: VULNERABLE, rules });

    const byLine = (line: number) => result.findings.find((f) => f.file === 'convert.ts' && f.line === line);

    expect(byLine(8)?.message).toContain('exec');
    expect(byLine(14)?.message).toContain('shell: true');
    expect(byLine(19)?.message).toContain('which program');
  });

  test('resolves aliased imports and require() namespaces', async () => {
    const result = await scan({ root: VULNERABLE, rules });

    expect(result.findings.find((f) => f.line === 19)?.message).toContain('execFile');
    expect(result.findings.find((f) => f.file === 'ping.js')?.message).toContain('execSync');
  });

  test('reports critical severity with an execFile example', async () => {
    const result = await scan({ root: VULNERABLE, rules });

    for (const finding of result.findings) {
      expect(finding.severity).toBe('critical');
      expect(finding.remediation.example).toContain('execFile(');
    }
  });

  test('accepts argument arrays without a shell, fixed commands, allow-lists and non-process exec', async () => {
    const result = await scan({ root: fixturePath('command-injection', 'safe'), rules });

    expect(result.filesScanned).toBe(1);
    expect(result.findings).toEqual([]);
  });
});
