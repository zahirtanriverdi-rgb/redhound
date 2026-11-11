import type { Dirent } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { errorMessage } from '../errors.js';
import type { ScanError } from '../types.js';
import type { IgnoreMatcher } from './ignore.js';

const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.next',
  '.turbo',
  '.vercel',
  'dist',
  'build',
  'out',
  'coverage',
]);

const SCRIPT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

/** Firebase security rules: `firestore.rules`, `storage.rules`, `database.rules.json`. */
const RULES_FILE_PATTERN = /\.rules(\.json)?$/;

/** JavaScript or TypeScript, which the scanner parses into a syntax tree. */
export function isScriptFile(filePath: string): boolean {
  return SCRIPT_EXTENSIONS.has(path.extname(filePath));
}

function isScannable(fileName: string): boolean {
  return isScriptFile(fileName) || RULES_FILE_PATTERN.test(fileName);
}

/** Throws a readable error unless `root` is an existing directory. */
export async function assertDirectory(root: string): Promise<void> {
  const stats = await stat(root).catch(() => undefined);
  if (stats === undefined) throw new Error(`Path does not exist: ${root}`);
  if (!stats.isDirectory()) throw new Error(`Path is not a directory: ${root}`);
}

export interface CollectedFiles {
  readonly files: readonly string[];
  /** Directories that could not be read (permissions, for example). They are skipped. */
  readonly errors: readonly ScanError[];
}

/**
 * Scannable files under `root` as sorted relative paths with forward slashes.
 * Symbolic links are not followed, so a scan never leaves the root.
 */
export async function collectSourceFiles(
  root: string,
  isIgnored: IgnoreMatcher = () => false,
  relativeDir = '',
): Promise<CollectedFiles> {
  let entries: Dirent[];
  try {
    entries = await readdir(path.join(root, relativeDir), { withFileTypes: true });
  } catch (error: unknown) {
    if (relativeDir === '') throw error;
    return { files: [], errors: [{ file: relativeDir, message: errorMessage(error) }] };
  }

  const nested = await Promise.all(
    entries.map(async (entry): Promise<CollectedFiles> => {
      const relativePath = relativeDir === '' ? entry.name : `${relativeDir}/${entry.name}`;
      if (isIgnored(relativePath)) return EMPTY;
      if (entry.isDirectory()) {
        return IGNORED_DIRECTORIES.has(entry.name)
          ? EMPTY
          : collectSourceFiles(root, isIgnored, relativePath);
      }
      const isMatch = entry.isFile() && isScannable(entry.name);
      return isMatch ? { files: [relativePath], errors: [] } : EMPTY;
    }),
  );

  return {
    files: nested.flatMap((result) => result.files).sort(),
    errors: nested.flatMap((result) => result.errors),
  };
}

const EMPTY: CollectedFiles = { files: [], errors: [] };
