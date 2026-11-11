import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { supabaseRls } from '../../src/rules/supabase-rls.js';
import { scan } from '../../src/scanner/scan.js';
import { fixturePath } from '../helpers.js';

const rules = [supabaseRls];
const VULNERABLE = fixturePath('supabase-rls', 'vulnerable');
const INIT = 'supabase/migrations/20250101000000_init.sql';
const ORDERS = 'supabase/migrations/20250102000000_orders.sql';
const LOOP = 'supabase/migrations/20250103000000_loop.sql';

describe('supabase-rls', () => {
  test('flags tables without RLS and policies open to everyone, across migrations', async () => {
    const result = await scan({ root: VULNERABLE, rules });

    const flagged = result.findings.map((f) => `${f.severity} ${f.file}:${f.line}`);

    expect(flagged).toEqual([
      `critical ${INIT}:2`,
      `critical ${INIT}:14`,
      `critical ${ORDERS}:15`,
      `critical ${LOOP}:1`,
      `high ${ORDERS}:7`,
      `medium ${ORDERS}:11`,
      `low ${INIT}:17`,
    ]);
  });

  test('names the table and explains what is exposed', async () => {
    const result = await scan({ root: VULNERABLE, rules });
    const at = (file: string, line: number) => result.findings.find((f) => f.file === file && f.line === line);

    expect(at(INIT, 2)?.message).toContain('public.profiles');
    expect(at(INIT, 14)?.message).toContain('UPDATE');
    expect(at(ORDERS, 7)?.message).toContain('public.orders');
    expect(at(ORDERS, 15)?.message).toContain('disabled');
  });

  test('gives SQL fixes for both kinds of finding', async () => {
    const result = await scan({ root: VULNERABLE, rules });

    expect(result.findings.find((f) => f.line === 2)?.remediation.example).toContain('enable row level security');
    expect(result.findings.find((f) => f.line === 14)?.remediation.example).toContain('auth.uid()');
  });

  test('accepts later fixes, owner policies, service role, other schemas, function bodies and plain Postgres', async () => {
    const result = await scan({ root: fixturePath('supabase-rls', 'safe'), rules });

    expect(result.filesScanned).toBe(4);
    expect(result.findings).toEqual([]);
  });

  test('honours redhound-ignore comments in SQL files', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'redhound-'));
    await mkdir(path.join(root, 'supabase', 'migrations'), { recursive: true });
    await writeFile(
      path.join(root, 'supabase', 'migrations', '001.sql'),
      '-- redhound-ignore-next-line supabase-rls -- public read-only lookup table\n' +
        'create table public.countries (code text primary key);\n',
    );

    try {
      const result = await scan({ root, rules });

      expect(result.findings).toEqual([]);
      expect(result.suppressed).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
