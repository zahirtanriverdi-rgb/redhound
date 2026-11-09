import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { scan } from '../src/scanner/scan.js';
import { fixturePath } from './helpers.js';

const LEAKY_SOURCE = 'export const key = process.env.NEXT_PUBLIC_SERVICE_ROLE_KEY;\n';
const UNPROTECTED_ROUTE = 'export async function POST() { return new Response("ok"); }\n';

describe('scan', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'redhound-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('skips dependency and build directories', async () => {
    await mkdir(path.join(root, 'node_modules', 'pkg'), { recursive: true });
    await mkdir(path.join(root, '.next'), { recursive: true });
    await writeFile(path.join(root, 'node_modules', 'pkg', 'index.js'), LEAKY_SOURCE);
    await writeFile(path.join(root, '.next', 'chunk.js'), LEAKY_SOURCE);

    const result = await scan({ root });

    expect(result.filesScanned).toBe(0);
    expect(result.findings).toEqual([]);
  });

  test('skips files that are not JavaScript or TypeScript', async () => {
    await writeFile(path.join(root, 'notes.md'), LEAKY_SOURCE);

    const result = await scan({ root });

    expect(result.filesScanned).toBe(0);
  });

  test('orders findings from most to least severe', async () => {
    await mkdir(path.join(root, 'app', 'api'), { recursive: true });
    await writeFile(path.join(root, 'app', 'api', 'route.ts'), UNPROTECTED_ROUTE);
    await writeFile(path.join(root, 'z-config.ts'), LEAKY_SOURCE);

    const result = await scan({ root });

    expect(result.findings.map((f) => f.severity)).toEqual(['critical', 'high']);
  });

  test('drops findings below the minimum severity', async () => {
    await mkdir(path.join(root, 'app', 'api'), { recursive: true });
    await writeFile(path.join(root, 'app', 'api', 'route.ts'), UNPROTECTED_ROUTE);
    await writeFile(path.join(root, 'config.ts'), LEAKY_SOURCE);

    const result = await scan({ root, minSeverity: 'critical' });

    expect(result.findings.map((f) => f.severity)).toEqual(['critical']);
  });

  test('reports paths relative to the root with forward slashes', async () => {
    const result = await scan({ root: fixturePath('nextjs-route-missing-auth', 'vulnerable') });

    expect(result.findings[0]?.file).toBe('app/api/posts/route.ts');
  });

  test('skips a directory it cannot read and keeps scanning the rest', async () => {
    const locked = path.join(root, 'locked');
    await mkdir(locked);
    await writeFile(path.join(root, 'config.ts'), LEAKY_SOURCE);
    await chmod(locked, 0o000);

    try {
      const result = await scan({ root });

      expect(result.findings).toHaveLength(1);
      expect(result.errors).toEqual([{ file: 'locked', message: expect.any(String) }]);
    } finally {
      await chmod(locked, 0o755);
    }
  });

  test('rejects a root that does not exist', async () => {
    await expect(scan({ root: path.join(root, 'missing') })).rejects.toThrow(/does not exist/);
  });

  test('rejects a root that is a file', async () => {
    const file = path.join(root, 'file.ts');
    await writeFile(file, LEAKY_SOURCE);

    await expect(scan({ root: file })).rejects.toThrow(/not a directory/);
  });
});
