import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const IGNORE_FILE_NAME = '.redhoundignore';

/** True when a relative path (forward slashes) should be skipped. */
export type IgnoreMatcher = (relativePath: string) => boolean;

/**
 * Builds a matcher from gitignore-style patterns:
 *
 *   worktrees        a bare name skips that file or directory at any depth
 *   tests/fixtures   a pattern with a slash is matched from the scan root
 *   src/*.ts         `*` matches within one path segment, `**` across segments
 */
export function createIgnoreMatcher(patterns: readonly string[]): IgnoreMatcher {
  const expressions = patterns.map(normalise).filter((p) => p !== '').map(toRegExp);
  return (relativePath) => expressions.some((expression) => expression.test(relativePath));
}

/** Patterns from `.redhoundignore` in the scan root, or none when the file is absent. */
export async function readIgnoreFile(root: string): Promise<readonly string[]> {
  try {
    const content = await readFile(path.join(root, IGNORE_FILE_NAME), 'utf8');
    return content.split('\n').filter((line) => !line.trim().startsWith('#'));
  } catch (error: unknown) {
    if (isMissingFile(error)) return [];
    throw error;
  }
}

function normalise(pattern: string): string {
  return pattern.trim().replace(/^\.\//, '').replace(/\/+$/, '');
}

function toRegExp(pattern: string): RegExp {
  const isAnchored = pattern.includes('/');
  const body = pattern
    .replace(/^\//, '')
    .split('**')
    .map((part) => part.split('*').map(escapeRegExp).join('[^/]*'))
    .join('.*');
  // A match also covers everything inside it, so `tests` skips `tests/a/b.ts`.
  return new RegExp(`${isAnchored ? '^' : '(^|/)'}${body}(/|$)`);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
