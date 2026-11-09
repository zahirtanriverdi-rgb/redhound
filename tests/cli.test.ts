import { describe, expect, test } from 'vitest';
import { runCli } from '../src/cli.js';
import { fixturePath } from './helpers.js';

interface CliRun {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

async function run(...args: string[]): Promise<CliRun> {
  const out: string[] = [];
  const err: string[] = [];
  const exitCode = await runCli(args, {
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
  });
  return { exitCode, stdout: out.join(''), stderr: err.join('') };
}

const VULNERABLE = fixturePath('nextjs-route-missing-auth', 'vulnerable');
const SAFE = fixturePath('nextjs-route-missing-auth', 'safe');

describe('redhound scan', () => {
  test('exits 1 and prints findings as JSON when issues are found', async () => {
    const result = await run('scan', VULNERABLE, '--format', 'json');

    const report = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(1);
    expect(report.summary).toMatchObject({ filesScanned: 1, findings: 2 });
    expect(report.findings[0].ruleId).toBe('nextjs-route-missing-auth');
  });

  test('exits 0 when the scan is clean', async () => {
    const result = await run('scan', SAFE);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('No issues found');
  });

  test('prints rule, location and fix in the default table format', async () => {
    const result = await run('scan', '--path', VULNERABLE);

    expect(result.stdout).toContain('nextjs-route-missing-auth');
    expect(result.stdout).toContain('app/api/posts/route.ts:7');
    expect(result.stdout).toContain('Fix:');
  });

  test('honours the --severity threshold', async () => {
    const result = await run('scan', VULNERABLE, '--severity', 'critical');

    expect(result.exitCode).toBe(0);
  });

  test('exits 2 with a clear message when the path does not exist', async () => {
    const result = await run('scan', '/definitely/not/a/real/path');

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('does not exist');
  });

  test('exits 2 on an unknown output format', async () => {
    const result = await run('scan', SAFE, '--format', 'xml');

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('xml');
  });

  test('prints the version', async () => {
    const result = await run('--version');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^\d+\.\d+\.\d+/);
  });
});
