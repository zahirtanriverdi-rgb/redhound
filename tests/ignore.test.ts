import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { scan } from '../src/scanner/scan.js';

const LEAKY_SOURCE = 'export const key = process.env.NEXT_PUBLIC_SERVICE_ROLE_KEY;\n';

describe('ignore patterns', () => {
  let root: string;

  async function write(relativePath: string, content = LEAKY_SOURCE): Promise<void> {
    await mkdir(path.dirname(path.join(root, relativePath)), { recursive: true });
    await writeFile(path.join(root, relativePath), content);
  }

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'redhound-'));
    await write('src/config.ts');
    await write('worktrees/copy/src/config.ts');
    await write('tests/fixtures/leak.ts');
    await write('src/generated/client.ts');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const scannedFiles = async (ignore?: readonly string[]): Promise<string[]> =>
    (await scan({ root, ignore })).findings.map((f) => f.file);

  test('a bare name skips that directory wherever it appears', async () => {
    expect(await scannedFiles(['worktrees', 'generated'])).toEqual([
      'src/config.ts',
      'tests/fixtures/leak.ts',
    ]);
  });

  test('a path with a slash is matched from the root', async () => {
    expect(await scannedFiles(['tests/fixtures'])).not.toContain('tests/fixtures/leak.ts');
  });

  test('wildcards match within a path segment', async () => {
    expect(await scannedFiles(['src/*.ts'])).not.toContain('src/config.ts');
    expect(await scannedFiles(['src/*.ts'])).toContain('src/generated/client.ts');
  });

  test('reads patterns from .redhoundignore, skipping comments and blank lines', async () => {
    await writeFile(path.join(root, '.redhoundignore'), '# copies\nworktrees/\n\ntests\n');

    expect(await scannedFiles()).toEqual(['src/config.ts', 'src/generated/client.ts']);
  });
});
