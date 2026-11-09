import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { scan } from '../src/scanner/scan.js';

const HANDLER = 'export async function POST() { return new Response("ok"); }\n';

describe('suppression comments', () => {
  let root: string;

  async function scanRoute(source: string) {
    await mkdir(path.join(root, 'app', 'api'), { recursive: true });
    await writeFile(path.join(root, 'app', 'api', 'route.ts'), source);
    return scan({ root });
  }

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'redhound-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('redhound-ignore-next-line hides the finding on the following line', async () => {
    const result = await scanRoute(`// redhound-ignore-next-line\n${HANDLER}`);

    expect(result.findings).toEqual([]);
    expect(result.suppressed).toBe(1);
  });

  test('redhound-ignore hides the finding on the same line', async () => {
    const result = await scanRoute(HANDLER.replace('\n', ' // redhound-ignore\n'));

    expect(result.findings).toEqual([]);
    expect(result.suppressed).toBe(1);
  });

  test('a rule id limits the comment to that rule and allows a reason after it', async () => {
    const comment = '// redhound-ignore-next-line nextjs-route-missing-auth -- guarded by middleware';

    const result = await scanRoute(`${comment}\n${HANDLER}`);

    expect(result.findings).toEqual([]);
  });

  test('a comment naming a different rule does not hide the finding', async () => {
    const result = await scanRoute(`// redhound-ignore-next-line public-env-secret\n${HANDLER}`);

    expect(result.findings).toHaveLength(1);
    expect(result.suppressed).toBe(0);
  });

  test('a comment two lines above does not hide the finding', async () => {
    const result = await scanRoute(`// redhound-ignore-next-line\n\n${HANDLER}`);

    expect(result.findings).toHaveLength(1);
  });
});
