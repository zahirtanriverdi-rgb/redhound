import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

export type FixtureKind = 'vulnerable' | 'safe';

export function fixturePath(ruleId: string, kind: FixtureKind): string {
  return path.join(FIXTURES_ROOT, ruleId, kind);
}
